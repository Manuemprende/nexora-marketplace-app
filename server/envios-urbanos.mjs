import {readFile} from 'node:fs/promises';
import {now,transaction} from './database.mjs';
import {fail} from './service.mjs';
const base='https://www.enviosurbanos.cl/api/v1/public';
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function enviosUrbanosCode(data){return String(data?.additional_shipping_fields?.find(f=>/env[ií]os\s*urbanos/i.test(f.label??''))?.value??'').trim().toUpperCase();}
async function request(path){const config=JSON.parse(await readFile(process.env.MEIBO_PUBLISH_CREDENTIALS??'/data/publishing-credentials.json','utf8'));if(!config.EnviosUrbanos?.token)fail(409,'Falta la conexión con Envíos Urbanos');const r=await fetch(base+path,{headers:{Authorization:'Bearer '+config.EnviosUrbanos.token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)fail(409,'Envíos Urbanos no entregó el envío: HTTP '+r.status);const j=await r.json();if(!j.data)fail(502,'Respuesta de Envíos Urbanos incompleta');return j.data;}
export async function fetchEnviosUrbanosShipment(id){if(!/^[a-z0-9]{15,40}$/.test(id))fail(400,'Identificador de envío inválido');return request('/shipments/'+id);}
export function isEnviosUrbanosOrder(data){return !!enviosUrbanosCode(data)||/env[ií]os[\s_-]*urbanos/i.test([data?.shipping_method,data?.shipping_method_name,...(data?.fulfillments??[]).map(f=>f.tracking_company)].join(' '));}
export function verifyEnviosUrbanosShipment(data,shipment,id,reference=''){
 const code=enviosUrbanosCode(data),ref=String(reference);
 if(String(shipment.id)!==id||!/^ENV-[A-Z0-9-]+$/.test(String(shipment.trackingCode??'').toUpperCase())||(code?code!==String(shipment.trackingCode??'').toUpperCase():!isEnviosUrbanosOrder(data)||!/^\d{1,12}$/.test(ref)||String(shipment.externalRef)!==ref))fail(409,'El seguimiento o referencia de Envíos Urbanos no coincide con el pedido');
 const address=data.shipping_address??{},name=[address.name,address.surname].filter(Boolean).join(' ')||data.customer?.name;
 if(!name||normalize(name)!==normalize(shipment.recipient?.name))fail(409,'El destinatario de la etiqueta no coincide con el pedido');
 if(!address.address||normalize([address.address,address.street_number,address.complement].filter(Boolean).join(' '))!==normalize(shipment.destination?.address)||normalize(address.municipality)!==normalize(shipment.destination?.municipality))fail(409,'La dirección de la etiqueta no coincide con el pedido');
}
async function download(id){
 const label=await request('/shipments/'+id+'/label');let u;try{u=new URL(label.url);}catch{fail(409,'Envíos Urbanos no devolvió una etiqueta válida');}
 if(u.protocol!=='https:'||u.hostname!=='s3.wasabisys.com'||u.username||u.password||!u.pathname.startsWith('/openwao/envios_urbanos/')||!u.pathname.includes('/etiquetas/'+id+'/')||!u.pathname.endsWith('.pdf'))fail(409,'Origen de la etiqueta de Envíos Urbanos no validado');
 const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)fail(409,'No se pudo descargar la etiqueta de Envíos Urbanos');
 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>10000000)fail(413,'Etiqueta demasiado grande');chunks.push(chunk);}const pdf=Buffer.concat(chunks);if(pdf.subarray(0,5).toString()!=='%PDF-')fail(409,'Envíos Urbanos no devolvió un PDF');return pdf;
}
export async function connectEnviosUrbanosShipment(db,orderId,id){
 if(!/^[a-z0-9]{15,40}$/.test(id))fail(400,'Identificador de envío inválido');
 const row=db.prepare("SELECT payload,external_id FROM external_order_details WHERE order_id=? AND platform='Jumpseller'").get(orderId);if(!row)fail(404,'Pedido de Jumpseller no encontrado');const data=JSON.parse(row.payload),shipment=await request('/shipments/'+id);verifyEnviosUrbanosShipment(data,shipment,id,row.external_id);
 const existing=db.prepare('SELECT shipment_id FROM envios_urbanos_shipments WHERE order_id=?').get(orderId);if(existing&&existing.shipment_id!==id)fail(409,'El pedido ya tiene otro envío vinculado');
 const cached=db.prepare('SELECT content FROM order_shipping_labels WHERE order_id=? AND fulfillment_id=?').get(orderId,'enviosurbanos:'+id),pdf=cached?Buffer.from(cached.content):await download(id);
 transaction(db,()=>{const latest=JSON.parse(db.prepare('SELECT payload FROM external_order_details WHERE order_id=?').get(orderId).payload);verifyEnviosUrbanosShipment(latest,shipment,id,row.external_id);db.prepare('INSERT INTO envios_urbanos_shipments VALUES (?,?,?,?) ON CONFLICT(order_id) DO NOTHING').run(orderId,id,shipment.trackingCode,now());db.prepare('INSERT INTO order_shipping_labels VALUES (?,?,?,?) ON CONFLICT(fulfillment_id) DO UPDATE SET content=excluded.content,captured_at=excluded.captured_at').run('enviosurbanos:'+id,orderId,pdf,now());});return {order_id:orderId,shipment_id:id,tracking_code:shipment.trackingCode,bytes:pdf.length};
}
export async function findEnviosUrbanosShipment(data,reference){
 if(!isEnviosUrbanosOrder(data))return null;
 const code=enviosUrbanosCode(data),ref=String(reference??'');
 if(code&&!/^ENV-[A-Z0-9-]{1,60}$/.test(code))fail(409,'Seguimiento de Envíos Urbanos inválido');
 if(!code&&!/^\d{1,12}$/.test(ref))fail(409,'Referencia de pedido inválida');
 const params=new URLSearchParams(code?{trackingCode:code}:{externalRef:ref}),rows=await request('/shipments?'+params);
 if(!Array.isArray(rows))fail(502,'Envíos Urbanos no devolvió una lista de envíos');
 if(!rows.length)return null;
 if(rows.length!==1)fail(409,'Hay varios envíos para esta referencia. Revisa antes de imprimir');
 const shipment=rows[0],id=String(shipment.id??'');if(!/^[a-z0-9]{15,40}$/.test(id))fail(409,'Identificador de envío inválido');
 if(ref&&shipment.externalRef!=null&&String(shipment.externalRef)!==ref)fail(409,'La referencia del envío no coincide con el pedido');
 verifyEnviosUrbanosShipment(data,shipment,id,ref);return shipment;
}
export async function enviosUrbanosLabel(db,orderId,data){
 let link=db.prepare('SELECT * FROM envios_urbanos_shipments WHERE order_id=?').get(orderId);
 const row=db.prepare("SELECT external_id FROM external_order_details WHERE order_id=? AND platform='Jumpseller'").get(orderId);
 if(!link){const shipment=await findEnviosUrbanosShipment(data,row?.external_id);if(!shipment)return null;await connectEnviosUrbanosShipment(db,orderId,shipment.id);link=db.prepare('SELECT * FROM envios_urbanos_shipments WHERE order_id=?').get(orderId);}
 const code=enviosUrbanosCode(data);
 if(code?code!==link.tracking_code:!isEnviosUrbanosOrder(data))fail(409,'El seguimiento del pedido cambió. Revisa su etiqueta antes de imprimir');
 const cached=db.prepare('SELECT content FROM order_shipping_labels WHERE order_id=? AND fulfillment_id=?').get(orderId,'enviosurbanos:'+link.shipment_id);if(cached)return Buffer.from(cached.content);
 await connectEnviosUrbanosShipment(db,orderId,link.shipment_id);return Buffer.from(db.prepare('SELECT content FROM order_shipping_labels WHERE fulfillment_id=?').get('enviosurbanos:'+link.shipment_id).content);
}
