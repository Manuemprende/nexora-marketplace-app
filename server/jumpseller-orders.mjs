import {enviosUrbanosLabel,isEnviosUrbanosOrder} from './envios-urbanos.mjs';
import {orderLabelAttachments,attachedOrderLabel} from './jumpseller-attachments.mjs';
import {readFile} from 'node:fs/promises';
import {uuid,now,transaction} from './database.mjs';
import {fail} from './service.mjs';

export async function jumpsellerRequest(path){
 const config=JSON.parse(await readFile(process.env.MEIBO_PUBLISH_CREDENTIALS??'/data/publishing-credentials.json','utf8'));
 const c=config.Jumpseller;if(!c)fail(409,'Faltan credenciales Jumpseller');
 const response=await fetch('https://api.jumpseller.com/v1'+path,{headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from(c.login+':'+c.token).toString('base64')},redirect:'error',signal:AbortSignal.timeout(40000)});
 const data=await response.json();if(!response.ok)fail(response.status===404?404:409,path.includes('/label')?'Jumpseller todavía no entrega una etiqueta válida para este envío. Revisa la generación de la guía en el pedido de origen.':'Jumpseller no pudo entregar el pedido o sus despachos.');
 return data;
}
export function importJumpsellerSnapshot(db,o,fulfillments,actor){
 if(!Number.isSafeInteger(o.id)||o.id<1)fail(400,'ID de pedido inválido');
 const existing=db.prepare("SELECT order_id,payload FROM external_order_details WHERE platform='Jumpseller' AND external_id=?").get(String(o.id));
 if(existing)return {id:existing.order_id,imported:false,fulfilled_in_origin:JSON.parse(existing.payload).fulfilled_in_origin};
 if(o.status!=='Paid')fail(409,'Solo se incorporan pedidos pagados');
 if(!Array.isArray(o.products)||!o.products.length)fail(409,'Pedido sin productos');
 const lines=o.products.map(i=>{
  if(i.type&&i.type!=='physical')fail(409,'El pedido contiene una línea no física; requiere revisión');
  if(!Number.isSafeInteger(i.qty)||i.qty<=0||!Number.isSafeInteger(i.price)||i.price<0)fail(409,'Cantidad o precio inválido en origen');
  const matches=db.prepare("SELECT c.variant_id,v.meibo_sku FROM channel_listings c JOIN variants v ON v.id=c.variant_id WHERE c.platform='Jumpseller' AND c.product_ref=? AND COALESCE(c.variant_ref,'')=? AND v.active=1").all(String(i.id),i.variant_id==null?'':String(i.variant_id));
  if(matches.length!==1)fail(409,`Producto ID ${i.id}${i.variant_id?' / variante '+i.variant_id:''}: falta una asociación única al SKU maestro. No se asociará por nombre.`);
  return {variant_id:matches[0].variant_id,qty:i.qty,price:i.price,source_code:i.sku||'ID '+i.id+(i.variant_id?' / Var. '+i.variant_id:''),snapshot:{product_id:i.id,variant_id:i.variant_id??null,sku:i.sku||'',name:i.name,qty:i.qty,price:i.price,discount:i.discount,options:i.options}};
 });
 if(new Set(lines.map(i=>i.variant_id)).size!==lines.length)fail(409,'Varias líneas corresponden al mismo maestro; requiere conciliación antes de importar');
 const alreadyFulfilled=o.fulfillment_status==='fulfilled',stamp=now();
 const payload={additional_shipping_fields:(o.additional_fields??[]).filter(f=>f.area==='shipping').map(f=>({label:f.label,value:f.value})),label_attachments:orderLabelAttachments(o),source_status:o.status,fulfillment_status:o.fulfillment_status,shipment_status:o.shipment_status,shipment_status_enum:o.shipment_status_enum??null,created_at:o.created_at,completed_at:o.completed_at,currency:o.currency,subtotal:o.subtotal,discount:o.discount,shipping:o.shipping,total:o.total,payment_method:o.payment_method_name,shipping_method:o.shipping_method_name,customer:{name:o.customer?.fullname||[o.shipping_address?.name,o.shipping_address?.surname].filter(Boolean).join(' '),email:o.customer?.email??'',phone:o.customer?.phone??''},shipping_option:o.shipping_option??null,shipping_required:o.shipping_required??null,pickup_address:o.pickup_address??null,shipping_address:o.shipping_address,billing_address:o.billing_address,lines:lines.map(i=>i.snapshot),fulfillments:fulfillments.map(f=>({id:f.id,type:f.type,tracking_company:f.tracking_company,tracking_number:f.tracking_number,shipment_status:f.shipment_status,label_available:!!f.label_url})),fulfilled_in_origin:alreadyFulfilled};
 return transaction(db,()=>{
  const id=uuid(),number=db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM orders').get().n;
  db.prepare("INSERT INTO orders(id,number,platform,external_reference,customer_name,status,stock_policy,actor_id,created_at,packed_at,inventory_allocated) VALUES (?,?,?,?,?,?,'reserved',?,?,?,0)").run(id,number,'Jumpseller',String(o.id),payload.customer.name||'Cliente Jumpseller',alreadyFulfilled?'packed':'pending',actor,stamp,null);
  for(const line of lines)db.prepare('INSERT INTO order_items(id,order_id,variant_id,qty,checked_qty,source_code,unit_price) VALUES (?,?,?,?,?,?,?)').run(uuid(),id,line.variant_id,line.qty,alreadyFulfilled?line.qty:0,line.source_code,line.price);
  db.prepare('INSERT INTO external_order_details VALUES (?,?,?,?,?)').run(id,'Jumpseller',String(o.id),JSON.stringify(payload),stamp);
  db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,alreadyFulfilled?'imported_fulfilled':'imported',actor,stamp);
  return {id,number,imported:true,fulfilled_in_origin:alreadyFulfilled};
 });
}
export async function importJumpsellerOrder(db,id,actor,{request=jumpsellerRequest,label=shippingLabel}={}){
 id=String(id).trim().replace(/^JS[-\s]*/i,'');
 if(!/^\d{1,12}$/.test(String(id)))fail(400,'Indica el número del pedido Jumpseller');
 const response=await request('/orders/'+id+'.json'),o=response.order;
 const rows=await request('/order/'+id+'/fulfillments.json');
 const result=importJumpsellerSnapshot(db,o,rows.map(x=>x.order_fulfillment??x),actor);
 if(o.shipping_option==='store_pickup'&&!orderLabelAttachments(o).length){result.label_available=false;result.label_message='Retiro en local: no requiere etiqueta de transporte';}
 else if(rows.length===1||orderLabelAttachments(o).length||isEnviosUrbanosOrder(o)||isEnviosUrbanosOrder({additional_shipping_fields:o.additional_fields})){try{await label(db,result.id);result.label_available=true;}catch{result.label_available=false;result.label_message='Pedido guardado. La etiqueta todavía no está disponible; puedes volver a consultarla desde empaque.';}}
 else{result.label_available=false;result.label_message=rows.length?'El pedido tiene varios despachos; requiere seleccionar sus etiquetas.':'El pedido todavía no tiene despacho ni etiqueta.';}
 return result;
}
export async function shippingLabel(db,orderId,{request=jumpsellerRequest,download=fetch}={}){
 const row=db.prepare("SELECT * FROM external_order_details WHERE order_id=? AND platform='Jumpseller'").get(orderId);if(!row)fail(404,'Pedido externo no encontrado');
 const details=JSON.parse(row.payload);
 if(details.label_attachments?.length){const selected=details.label_attachments[0],cached=db.prepare('SELECT content FROM order_shipping_labels WHERE fulfillment_id=? AND order_id=?').get(selected.key,orderId);if(cached&&details.label_attachments.length===1)return Buffer.from(cached.content);const response=await request('/orders/'+row.external_id+'.json'),source=response.order??response;if(String(source.id)!==row.external_id)fail(409,'Referencia de etiqueta distinta del pedido');return attachedOrderLabel(db,orderId,source);}
 const euLabel=await enviosUrbanosLabel(db,orderId,details);if(euLabel)return euLabel;
 const cached=db.prepare('SELECT content FROM order_shipping_labels WHERE order_id=? ORDER BY captured_at DESC LIMIT 1').get(orderId);if(cached)return Buffer.from(cached.content);
 const refreshed=await request('/orders/'+row.external_id+'.json'),source=refreshed.order??refreshed;
 if(String(source.id)!==row.external_id)fail(409,'Referencia de etiqueta distinta del pedido');
 const attachments=orderLabelAttachments(source);
 if(attachments.length){const current=JSON.parse(db.prepare('SELECT payload FROM external_order_details WHERE order_id=?').get(orderId).payload);db.prepare('UPDATE external_order_details SET payload=? WHERE order_id=?').run(JSON.stringify({...current,label_attachments:attachments}),orderId);return attachedOrderLabel(db,orderId,source);}
 if(source.shipping_option==='store_pickup')fail(409,'Retiro en local: este pedido no requiere etiqueta de transporte');
 const rows=await request('/order/'+row.external_id+'/fulfillments.json');
 const ids=rows.map(x=>(x.order_fulfillment??x).id);if(!ids.length)fail(409,'El pedido todavía no tiene despacho ni etiqueta');
 if(ids.length>1)fail(409,'El pedido tiene varios despachos. Requiere seleccionar su etiqueta por separado.');
 const fulfillment=rows.map(x=>x.order_fulfillment??x)[0];
 // `manual` describes the fulfillment record, not the delivery option chosen at checkout.
 // Always consult the actual label endpoint rather than suppressing that lookup.
 const label=fulfillment.label_url?{url:fulfillment.label_url}:await request('/fulfillments/'+ids[0]+'/label.json');let u;try{u=new URL(label.url);}catch{fail(409,'La etiqueta todavía no está disponible');}
 if(u.protocol!=='https:'||!/^jumpseller(?:-private)?\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(u.hostname))fail(409,'Origen de etiqueta pendiente de validar');
 const res=await download(u,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!res.ok)fail(409,'No se pudo descargar la etiqueta');
 const reader=res.body.getReader(),chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10000000){await reader.cancel();fail(413,'Etiqueta demasiado grande');}chunks.push(value);}
 const pdf=Buffer.concat(chunks);if(pdf.subarray(0,5).toString()!=='%PDF-')fail(409,'La etiqueta recibida no es un PDF válido');
 db.prepare('INSERT INTO order_shipping_labels VALUES (?,?,?,?) ON CONFLICT(fulfillment_id) DO UPDATE SET content=excluded.content,captured_at=excluded.captured_at').run(String(ids[0]),orderId,pdf,now());return pdf;
}
