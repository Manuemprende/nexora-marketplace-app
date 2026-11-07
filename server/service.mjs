import { randomBytes } from 'node:crypto';
import {jumpsellerPickupAvailable} from './jumpseller-state.mjs';
import {evolutSupplierValues} from './evolut-values.mjs';
import {validRut} from './rut.mjs';
import {enqueueEvolutPreparation,evolutSourceCode} from './evolut-orders.mjs';
import {isLocalPickup} from './pickup-kind.mjs';
import {requireSupportResolved,cancelOrderSupport} from './packing-support.mjs';
import {enqueuePreparedJumpseller,enqueueDeliveredJumpseller} from './jumpseller-prepared.mjs';
import {cashPaymentDetails,recordCashPayment,refundPaymentWithinTransaction} from './cash-drawer.mjs';
import {saleTotals} from './pricing.mjs';
import { uuid, now, transaction } from './database.mjs';
export class ApiError extends Error { constructor(status,message) { super(message); this.status=status; } }
export const fail = (status,message) => { throw new ApiError(status,message); };
export function text(value,label,max=200,required=false) {
  if (typeof value !== 'string' || value.length>max || (required&&!value.trim())) fail(400,`${label}: valor inválido`);
  return value.trim();
}
export function integer(value,label,min=0) {
  if (!Number.isSafeInteger(value)||value<min||value>100000000) fail(400,`${label}: debe ser un entero entre ${min} y 100000000`);
  return value;
}
function safeUrl(value,label) {
  value=text(value??'',label,2000);
  if(label==='Imagen'&&/^\/api\/images\/[a-f0-9-]{36}\.webp$/.test(value))return value;
  if (value) { let url; try { url=new URL(value); } catch { fail(400,`${label}: URL inválida`); }
    if (!['http:','https:'].includes(url.protocol)) fail(400,`${label}: usa http o https`); }
  return value;
}
export function catalog(db,{summary=false,id=null}={}) {
  const rows=db.prepare(`SELECT v.id,v.product_id,v.meibo_sku sku,v.attributes,v.color,v.size,v.presentation,v.price,v.active,p.name,${summary?'':'p.description,'}p.category,p.image_url,p.source_url,p.is_demo,i.on_hand stock,i.reserved,i.stock_confirmed,COALESCE(vp.low_threshold,15) low_threshold,COALESCE(vp.safety_stock,0) safety_stock,COALESCE(vp.target_stock,0) target_stock FROM variants v JOIN products p ON p.id=v.product_id JOIN inventory i ON i.variant_id=v.id LEFT JOIN variant_policies vp ON vp.variant_id=v.id ${id?'WHERE v.id=?':''} ORDER BY v.meibo_sku`).all(...(id?[id]:[]));
  const codes=db.prepare('SELECT c.*,s.quantity published_stock,s.updated_at stock_updated_at FROM external_codes c LEFT JOIN platform_stock s ON s.code_id=c.id ORDER BY c.platform').all();
  const publications=new Map(db.prepare('SELECT variant_id,platform,published_stock,remote_status,captured_at FROM channel_listings WHERE variant_id IS NOT NULL').all().map(c=>[c.variant_id+':'+c.platform,c]));
  const grouped=new Map();for(const code of codes){if(!grouped.has(code.variant_id))grouped.set(code.variant_id,[]);grouped.get(code.variant_id).push(code);}
  const staged=new Set(db.prepare('SELECT v.product_id FROM channel_master_origins o JOIN variants v ON v.id=o.variant_id').all().map(r=>r.product_id));
  return rows.map(row=>{const assigned=(grouped.get(row.id)??[]).map(c=>{const listing=publications.get(row.id+':'+c.platform);return {...c,...(listing?{published_stock:listing.published_stock,stock_unlimited:listing.remote_status.includes('stock ilimitado'),stock_updated_at:listing.captured_at,catalog_source:'api'}:{}),...(c.platform==='Jumpseller'?{price:row.price,price_source:'web_pos'}:{})};});return {...row,...(summary?{details_pending:true}:{}),pos_enabled:!staged.has(row.product_id)||row.source_url.includes('meibo.cl')||!row.source_url,codes:Object.fromEntries(assigned.map(c=>[c.platform,c.code])),external_codes:assigned};});
}
export function requireVariant(db,id) {
  const variant=db.prepare('SELECT v.*,i.on_hand stock,i.reserved,i.stock_confirmed,COALESCE(vp.low_threshold,15) low_threshold,COALESCE(vp.safety_stock,0) safety_stock,COALESCE(vp.target_stock,0) target_stock FROM variants v JOIN inventory i ON i.variant_id=v.id LEFT JOIN variant_policies vp ON vp.variant_id=v.id WHERE v.id=?').get(id);
  if (!variant) fail(404,'Variante no encontrada');
  return variant;
}
export function operation(db,actor,requestId,payload,action) {
  text(requestId,'Referencia de operación',100,true);
  const fingerprint=JSON.stringify(payload);
  return transaction(db,()=>{
    const previous=db.prepare('SELECT * FROM operations WHERE request_id=?').get(requestId);
    if(previous) {
      if(previous.actor_id!==actor||previous.fingerprint!==fingerprint) fail(409,'Referencia usada por otra operación');
      return JSON.parse(previous.result_json);
    }
    const result=action();
    db.prepare('INSERT INTO operations VALUES (?,?,?,?)').run(requestId,actor,fingerprint,JSON.stringify(result));
    return result;
  });
}
export function record(db,id,type,before,after,reason,actor,reference,reservedAfter) {
  const reservedBefore=db.prepare('SELECT reserved FROM inventory WHERE variant_id=?').get(id).reserved;
  reservedAfter ??= reservedBefore;
  db.prepare('UPDATE inventory SET on_hand=?,reserved=? WHERE variant_id=?').run(after,reservedAfter,id);
  db.prepare('INSERT INTO inventory_movements VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(uuid(),id,type,after-before,before,after,reason,actor,reference,now(),reservedBefore,reservedAfter);
}
export function categories(db){return db.prepare('SELECT name FROM categories ORDER BY name COLLATE NOCASE').all().map(r=>r.name);}
export function addCategory(db,input){const name=text(input.name,'Categoría',100,true);if(/^\d+$/.test(name))fail(400,'Usa un nombre de categoría, no un identificador numérico');db.prepare('INSERT OR IGNORE INTO categories(name) VALUES (?)').run(name);return {name:db.prepare('SELECT name FROM categories WHERE name=? COLLATE NOCASE').get(name).name};}
function categoryName(db,value){const name=text(value??'','Categoría',100);return name?addCategory(db,{name}).name:'';}
function variantOptions(input){const color=text(input.color??'','Color',80),size=text(input.size??'','Talla',80),presentation=text(input.presentation??input.attributes??'','Presentación',200);const attributes=[color&&`Color: ${color}`,size&&`Talla: ${size}`,presentation].filter(Boolean).join(' · ');text(attributes,'Variante',400);return {color,size,presentation,attributes};}
export function createVariant(db,input,actor,{inTransaction=false}={}) {
  const sku=text(input.sku??'','SKU',80).toUpperCase();
  const {color,size,presentation,attributes}=variantOptions(input);
  const price=integer(input.price,'Precio');
  const stock=integer(input.stock??0,'Stock inicial');
  const create=()=>{
    let productId=input.product_id;
    if(productId) { if(!db.prepare('SELECT id FROM products WHERE id=?').get(productId)) fail(404,'Producto no encontrado'); }
    else {
      productId=uuid();
      db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?)').run(productId,text(input.name,'Nombre',200,true),text(input.description??'','Descripción',2000),categoryName(db,input.category),safeUrl(input.image_url,'Imagen'),safeUrl(input.source_url,'Origen'),input.is_demo===false?0:1);
    }
    let next=125,assigned=sku;
    if(!assigned) { const all=db.prepare('SELECT meibo_sku FROM variants').all();
      for(const row of all) { const match=/^(?:NEX|MEI)-(\d+)$/.exec(row.meibo_sku); if(match) next=Math.max(next,Number(match[1])+1); }
      assigned=`NEX-${String(next).padStart(5,'0')}`;
    }
    const id=uuid();
    db.prepare('INSERT INTO variants(id,product_id,meibo_sku,attributes,price,active,color,size,presentation) VALUES (?,?,?,?,?,1,?,?,?)').run(id,productId,assigned,attributes,price,color,size,presentation);
    db.prepare('INSERT INTO inventory(variant_id,on_hand,stock_confirmed) VALUES (?,0,?)').run(id,input.stock_confirmed===false?0:1);
    record(db,id,'initial',0,stock,text(input.reason??'Carga inicial explícita','Motivo',500,true),actor,uuid());
    return {id,product_id:productId,sku:assigned};
  };
  return inTransaction?create():transaction(db,create);
}
export function editVariant(db,id,input) {
  const variant=requireVariant(db,id);
  return transaction(db,()=>{
    db.prepare('UPDATE products SET name=?,description=?,category=?,image_url=?,source_url=? WHERE id=?').run(text(input.name,'Nombre',200,true),text(input.description??'','Descripción',2000),categoryName(db,input.category),safeUrl(input.image_url,'Imagen'),safeUrl(input.source_url,'Origen'),variant.product_id);
    const {color,size,presentation,attributes}=variantOptions(input);db.prepare('UPDATE variants SET attributes=?,price=?,color=?,size=?,presentation=? WHERE id=?').run(attributes,integer(input.price,'Precio'),color,size,presentation,id);
    return {id};
  });
}
export function changeStock(db,id,input,actor) {
  const reason=text(input.reason,'Motivo',500,true);
  if(!['entry','exit','adjustment'].includes(input.type)) fail(400,'Tipo de movimiento inválido');
  const quantity=integer(input.quantity,'Cantidad',input.type==='adjustment'?0:1);
  return operation(db,actor,input.request_id,{id,type:input.type,quantity,reason},()=>{
    const variant=requireVariant(db,id);
    if(!variant.active) fail(409,'Variante inactiva');
    const after=input.type==='adjustment'?quantity:variant.stock+(input.type==='entry'?quantity:-quantity);
    if(after<variant.reserved) fail(409,'Stock insuficiente o unidades reservadas');
    integer(after,'Stock resultante');
    record(db,id,input.type,variant.stock,after,reason,actor,input.request_id);
    db.prepare('UPDATE inventory SET stock_confirmed=1 WHERE variant_id=?').run(id);
    return {id,stock:after};
  });
}
export function addCode(db,id,input) {
  requireVariant(db,id);
  const platform=text(input.platform,'Plataforma',60,true);
  const code=text(input.code,'Código',120,true);
  const master=db.prepare('SELECT id FROM variants WHERE meibo_sku=?').get(code);
  if(master&&master.id!==id) fail(409,'El código coincide con otro SKU maestro');
  db.prepare('INSERT INTO external_codes(id,variant_id,platform,code,origin,created_at,price) VALUES (?,?,?,?,?,?,?)').run(uuid(),id,platform,code,text(input.origin??'Registro manual','Origen',200,true),now(),input.price==null?null:integer(input.price,'Precio de plataforma',0));
  return {ok:true};
}
export function editPlatformPrice(db,id,input){const row=db.prepare('SELECT id FROM external_codes WHERE id=?').get(id);if(!row)fail(404,'Asignación no encontrada');const price=integer(input.price,'Precio de plataforma',0);db.prepare('UPDATE external_codes SET price=? WHERE id=?').run(price,id);return {ok:true,price};}
export function movements(db) {
  return db.prepare(`SELECT m.*,v.meibo_sku sku,p.name,u.email actor,COALESCE(o.platform,CASE WHEN s.id IS NOT NULL THEN 'POS' END,CASE WHEN rr.source_type='sale' THEN 'POS' ELSE ro.platform END,'Bodega') channel FROM inventory_movements m JOIN variants v ON v.id=m.variant_id JOIN products p ON p.id=v.product_id JOIN users u ON u.id=m.actor_id LEFT JOIN orders o ON o.id=m.reference_id LEFT JOIN sales s ON s.id=m.reference_id LEFT JOIN received_returns rr ON rr.id=m.reference_id LEFT JOIN orders ro ON rr.source_type='order' AND ro.id=rr.source_id ORDER BY m.created_at DESC,m.rowid DESC`).all();
}
export function sales(db,{actorId=null}={}) {
  return db.prepare('SELECT s.*,seller.email seller_email,u.email cancelled_by_email,(SELECT COALESCE(SUM(amount),0) FROM cash_refunds WHERE sale_id=s.id) refunded_total FROM sales s JOIN users seller ON seller.id=s.actor_id LEFT JOIN users u ON u.id=s.cancelled_by WHERE (? IS NULL OR s.actor_id=?) ORDER BY s.created_at DESC,s.rowid DESC').all(actorId,actorId).map(s=>({...s,items:db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(s.id),duplication:db.prepare('SELECT d.*,u.email actor_email,src.number source_number FROM sale_duplications d JOIN users u ON u.id=d.actor_id JOIN sales src ON src.id=d.source_sale_id WHERE d.completed_sale_id=?').get(s.id)??null,duplicates:db.prepare('SELECT d.*,u.email actor_email,dst.number sale_number FROM sale_duplications d JOIN users u ON u.id=d.actor_id JOIN sales dst ON dst.id=d.completed_sale_id WHERE d.source_sale_id=? ORDER BY d.created_at').all(s.id)}));
}
export function duplicateSale(db,id,input,actor){
 const reason=text(input.reason,'Motivo de duplicación',1000,true);
 return operation(db,actor,input.request_id,{id,action:'duplicate-sale',reason},()=>{
  const source=db.prepare('SELECT * FROM sales WHERE id=?').get(id);if(!source)fail(404,'Venta no encontrada');
  const existing=db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(id),products=new Map(catalog(db).map(p=>[p.id,p]));
  if(!existing.length)fail(409,'La venta no contiene productos para duplicar');
  const items=existing.map(line=>{const product=products.get(line.variant_id);if(!product)fail(409,'Un producto de la venta ya no está disponible');return {...product,qty:line.qty};});
  const draft=uuid();db.prepare('INSERT INTO sale_duplications VALUES (?,?,?,?,?,NULL)').run(draft,id,reason,actor,now());
  return {duplication_id:draft,source_id:id,source_number:source.number,reason,items,customer:source.customer_id?db.prepare('SELECT id,name,rut,address,giro,city,email,phone FROM customers WHERE id=?').get(source.customer_id)??null:null,payment_method:source.payment_method,document_type:source.document_type,discount_type:source.discount_type,discount_value:source.discount_value,needs_packing:!!db.prepare('SELECT id FROM orders WHERE sale_id=?').get(id)};
 });
}
export function cancelSale(db,id,input,actor) {
  const reason=text(input.reason,'Motivo de cancelación',1000,true),refund_method=input.refund_method??null;
  return operation(db,actor,input.request_id,{id,action:'cancel-sale',reason,refund_method},()=>{
    const sale=db.prepare('SELECT * FROM sales WHERE id=?').get(id);
    if(!sale)fail(404,'Venta no encontrada');
    if(sale.status==='cancelled'){
      if(sale.cancellation_reason!==reason)fail(409,'La venta ya fue cancelada. El motivo registrado se conserva');
      return {id,status:'cancelled',cancelled_at:sale.cancelled_at};
    }
    let refund=null;
    if(sale.cash_controlled){const already=db.prepare('SELECT COALESCE(SUM(amount),0) n FROM cash_refunds WHERE sale_id=?').get(id).n;const remaining=sale.total-already;if(remaining>0)refund=refundPaymentWithinTransaction(db,id,remaining,refund_method??sale.payment_method,reason,actor);}
    const linked=db.prepare('SELECT * FROM orders WHERE sale_id=?').all(id);
    if(linked.some(o=>o.stock_policy!=='deducted'))fail(409,'El pedido asociado requiere revisión de inventario antes de cancelar');
    let restored=0;
    for(const line of db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(id)){
      const returned=db.prepare("SELECT COALESCE(SUM(quantity),0) n FROM received_returns WHERE source_type='sale' AND source_id=? AND variant_id=?").get(id,line.variant_id).n;
      if(returned>line.qty)fail(409,'Las devoluciones registradas requieren revisión');
      const quantity=line.qty-returned;
      if(quantity){const v=requireVariant(db,line.variant_id);record(db,line.variant_id,'entry',v.stock,integer(v.stock+quantity,'Stock final'),`Cancelación venta V-${String(sale.number).padStart(6,'0')} · ${reason}`,actor,id);restored+=quantity;}
    }
    const stamp=now();
    db.prepare("UPDATE sales SET status='cancelled',cancellation_reason=?,cancelled_at=?,cancelled_by=?,cancellation_refund_method=?,cancellation_refund_amount=? WHERE id=?").run(reason,stamp,actor,refund?.method??null,refund?.amount??0,id);
    for(const order of linked){if(order.status!=='cancelled'){
      db.prepare("UPDATE orders SET status='cancelled',inventory_allocated=0 WHERE id=?").run(order.id);
      db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),order.id,null,'sale_cancelled',actor,stamp);cancelOrderSupport(db,order.id,actor);
    }}
    return {id,status:'cancelled',cancelled_at:stamp,restored_units:restored};
  });
}
export function checkout(db,input,actor) {
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>100) fail(400,'Carrito inválido');
  const items=input.items.map(i=>({id:text(i.id,'Variante',80,true),qty:integer(i.qty,'Cantidad',1)}));
  if(new Set(items.map(i=>i.id)).size!==items.length) fail(400,'Variantes repetidas en carrito');
  const document_type=input.document_type??'receipt',payment_method=input.payment_method??'cash';
  if(!['receipt','boleta','factura','boleta_demo','factura_demo'].includes(document_type)) fail(400,'Formato de comprobante inválido');
  if(!['cash','card','transfer'].includes(payment_method)) fail(400,'Medio de pago inválido');
  const customer_id=text(input.customer_id??'','Cliente seleccionado',80),selectedCustomer=customer_id?db.prepare('SELECT * FROM customers WHERE id=?').get(customer_id):null;
  if(customer_id&&!selectedCustomer)fail(404,'Cliente no encontrado');
  if(selectedCustomer?.rut&&!validRut(selectedCustomer.rut))fail(400,'El RUT guardado del cliente no es válido. Revisa sus datos antes de registrar la venta.');
  input={...input,...(selectedCustomer?{customer_name:selectedCustomer.name,customer_rut:selectedCustomer.rut,customer_address:selectedCustomer.address,customer_giro:selectedCustomer.giro,customer_city:selectedCustomer.city}:{})};
  const customer_name=text(input.customer_name??'','Cliente',200),customer_rut=text(input.customer_rut??'','RUT',30),customer_address=text(input.customer_address??'','Dirección',300);
  if((document_type==='factura_demo'||document_type==='factura')&&(!customer_name||!customer_rut||!customer_address)) fail(400,'El formato factura requiere razón social, RUT y dirección');
  const customer_giro=text(input.customer_giro??input.customer_business??'','Giro',200),customer_city=text(input.customer_city??'','Comuna',200);
  const duplication_id=text(input.duplication_id??'','Duplicación de venta',80);
  const needs_packing=input.needs_packing===true,discount=input.discount??{type:'none',value:0};
  return operation(db,actor,input.request_id,{items,duplication_id,document_type,payment_method,customer_id,customer_name,customer_rut,customer_address,customer_giro,customer_city,needs_packing,discount,cash_session_id:input.cash_session_id??null,cash_received:input.cash_received??null,cash_control:input.cash_control===true,expected_total:input.expected_total??null},()=>{
    if(duplication_id){const draft=db.prepare('SELECT * FROM sale_duplications WHERE id=?').get(duplication_id);if(!draft||draft.actor_id!==actor)fail(403,'La duplicación no corresponde a este usuario');if(draft.completed_sale_id)fail(409,'Esta duplicación ya se registró como venta; revisa el historial');}
    const lines=items.map(i=>{
      const v=requireVariant(db,i.id);
      if(!v.active||v.stock-v.reserved<i.qty) fail(409,`Stock insuficiente para ${v.meibo_sku}`);
      return {...i,...v,name:db.prepare('SELECT name FROM products WHERE id=?').get(v.product_id).name};
    });
    const id=uuid(),created_at=now(),subtotal=lines.reduce((n,l)=>n+l.qty*l.price,0);
    let totals;try{totals=saleTotals(subtotal,discount);}catch(error){fail(400,error.message);}
    const {total}=totals;const cashPayment=cashPaymentDetails(db,input,total,payment_method);
    const number=db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM sales').get().n;
    db.prepare('INSERT INTO sales(id,actor_id,total,created_at,number,customer_name,customer_rut,customer_address,payment_method,document_type) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,actor,total,created_at,number,customer_name,customer_rut,customer_address,payment_method,document_type);
    db.prepare('UPDATE sales SET customer_giro=?,customer_city=?,company_json=? WHERE id=?').run(customer_giro,customer_city,db.prepare('SELECT payload FROM business_settings WHERE id=1').get()?.payload??'{}',id);
    db.prepare('UPDATE sales SET customer_id=?,customer_email=?,customer_phone=?,subtotal=?,discount_type=?,discount_value=?,discount_amount=? WHERE id=?').run(customer_id||null,selectedCustomer?.email??'',selectedCustomer?.phone??'',totals.subtotal,totals.discount_type,totals.discount_value,totals.discount_amount,id);
    if(duplication_id)db.prepare('UPDATE sale_duplications SET completed_sale_id=? WHERE id=?').run(id,duplication_id);
    recordCashPayment(db,id,cashPayment,actor);
    for(const line of lines) {
      db.prepare('INSERT INTO sale_items VALUES (?,?,?,?,?,?,?)').run(uuid(),id,line.id,line.name,line.meibo_sku,line.qty,line.price);
      record(db,line.id,'sale',line.stock,line.stock-line.qty,'Venta local',actor,id);
    }
    const order=needs_packing?insertOrder(db,{platform:'POS',external_reference:`POS-${number}`,customer_name:customer_name||'Cliente mostrador',stock_policy:'deducted',sale_id:id,items:lines.map(l=>({id:l.id,qty:l.qty,source_code:l.meibo_sku,unit_price:l.price}))},actor):null;
    return {id,number,...totals,created_at,order_id:order?.id??null,cash_received:cashPayment.received,cash_change:cashPayment.change,cash_session_id:cashPayment.session_id,customer_name,customer_rut,customer_address,payment_method,document_type,items:db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(id).map(row=>({...row}))};
  });
}

function insertOrder(db,input,actor) {
  const id=uuid(),number=db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM orders').get().n;
  db.prepare('INSERT INTO orders(id,number,platform,external_reference,customer_name,status,stock_policy,sale_id,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,number,input.platform,input.external_reference,input.customer_name,'pending',input.stock_policy,input.sale_id??null,actor,now());
  for(const item of input.items) db.prepare('INSERT INTO order_items(id,order_id,variant_id,qty,source_code,unit_price) VALUES (?,?,?,?,?,?)').run(uuid(),id,item.id,item.qty,item.source_code,item.unit_price??null);
  db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,'created',actor,now());
  return {id,number};
}
export function orders(db) {
  const orderRows=db.prepare('SELECT * FROM orders ORDER BY created_at DESC,rowid DESC').all();if(!orderRows.length)return [];
  const products=catalog(db),productById=new Map(products.map(p=>[p.id,p]));
  const external=new Map(db.prepare('SELECT order_id,payload FROM external_order_details').all().map(r=>[r.order_id,JSON.parse(r.payload)]));
  for(const link of db.prepare('SELECT * FROM envios_urbanos_shipments').all()){const data=external.get(link.order_id);if(data&&data.additional_shipping_fields?.some(f=>/env[ií]os\s*urbanos/i.test(f.label??'')&&String(f.value??'').trim().toUpperCase()===link.tracking_code))data.envios_urbanos={shipment_id:link.shipment_id,tracking_code:link.tracking_code};}
  for(const state of db.prepare('SELECT order_id,status,message FROM evolut_prepare_outbox').all()){const data=external.get(state.order_id);if(data)data.origin_preparation={status:state.status,message:state.message};}
  for(const state of db.prepare('SELECT order_id,status,message,prepared_at FROM evolut_cancel_outbox').all()){const data=external.get(state.order_id);if(data)data.origin_cancellation=state;}
  const labels=new Set(db.prepare('SELECT DISTINCT order_id FROM order_shipping_labels').all().map(r=>r.order_id));
  return orderRows.map(order=>({...order,external:external.get(order.id)??null,has_shipping_label:labels.has(order.id),stock_issues:['pending','packing'].includes(order.status)?stockIssues(db,order):[],items:db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id).map(item=>{const data=external.get(order.id),index=order.platform==='Evolut'?(data?.lines??[]).findIndex(l=>evolutSourceCode(l)===item.source_code):-1;const value=index>=0?evolutSupplierValues({items:data.lines}).lines[index]:null;return {...item,...(order.platform==='Evolut'?{supplier_unit_price:item.unit_price,supplier_line_total:value?.subtotal??null}:{}),product:productById.get(item.variant_id)};}),events:db.prepare('SELECT e.*,u.email actor FROM packing_events e JOIN users u ON u.id=e.actor_id WHERE order_id=? ORDER BY e.created_at,e.rowid').all(order.id)}));
}
function stockIssues(db,order) {
  if(order.stock_policy==='deducted')return [];
  return db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id).flatMap(item=>{
    const v=requireVariant(db,item.variant_id);
    const available=order.inventory_allocated?Math.min(v.stock,v.reserved):v.stock-v.reserved;
    const reason=!v.active?'Producto inactivo':!v.stock_confirmed?'Stock físico pendiente de confirmar':available<item.qty?'Stock insuficiente':'';
    return reason?[{variant_id:item.variant_id,sku:v.meibo_sku,required:item.qty,available,missing:Math.max(0,item.qty-available),reason}]:[];
  });
}
function beginPreparation(db,order,actor) {
  if(!order)fail(404,'Pedido no encontrado');
  if(order.status==='cancelled')fail(409,'El pedido fue cancelado');
  if(order.status==='packed')return;
  const external=db.prepare('SELECT payload FROM external_order_details WHERE order_id=?').get(order.id);
  const origin=external?JSON.parse(external.payload):null;if(origin?.requires_review)fail(409,origin.review_reason||'El pedido de origen requiere revisión');
  const issues=stockIssues(db,order);
  if(issues.length)fail(409,'No se puede preparar el pedido completo: '+issues.map(i=>`${i.sku}: ${i.reason} (${i.available}/${i.required} unidades)`).join('; '));
  if(order.stock_policy==='reserved'&&!order.inventory_allocated){
    for(const item of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id)){const v=requireVariant(db,item.variant_id);record(db,item.variant_id,'reserve',v.stock,v.stock,`Reserva completa al iniciar PED-${String(order.number).padStart(5,'0')}`,actor,order.id,v.reserved+item.qty);}
    db.prepare('UPDATE orders SET inventory_allocated=1 WHERE id=?').run(order.id);
  }
  if(!order.preparation_started_at){const started=now();db.prepare("UPDATE orders SET preparation_started_at=?,status='packing' WHERE id=?").run(started,order.id);db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),order.id,null,'started',actor,started);}
}
export function savePackingDelivery(db,id,input,actor){
 const type=text(input.type,'Modalidad de entrega',20,true);if(!['pickup','regional','delivery'].includes(type))fail(400,'Modalidad de entrega inválida');
 return operation(db,actor,input.request_id,{id,action:'packing-delivery',type},()=>{
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!order)fail(404,'Pedido no encontrado');if(order.status==='cancelled')fail(409,'El pedido está cancelado');
  if(order.pickup_delivered_at)fail(409,'El pedido ya fue entregado; se conserva su modalidad');
  if(order.packing_delivery_type!==type){db.prepare('UPDATE orders SET packing_delivery_type=? WHERE id=?').run(type,id);db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,'delivery_'+type,actor,now());}
  return {id,packing_delivery_type:type};
 });
}
export function startPreparation(db,id,input,actor) {
  return operation(db,actor,input.request_id,{id,action:'start-preparation'},()=>{beginPreparation(db,db.prepare('SELECT * FROM orders WHERE id=?').get(id),actor);const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);return {id,status:order.status,preparation_started_at:order.preparation_started_at};});
}
export function cancelPreparation(db,id,input,actor) {
  const startedAt=text(input.started_at,'Inicio de preparación',40,true);
  return operation(db,actor,input.request_id,{id,action:'cancel-preparation',startedAt},()=>{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if(!order)fail(404,'Pedido no encontrado');
    if(order.status==='packed'||order.status==='cancelled')fail(409,'Solo puedes cancelar una preparación en curso');
    if(order.status==='pending'&&!order.preparation_started_at)return {id,status:'pending'};
    if(order.status!=='packing'||order.preparation_started_at!==startedAt)fail(409,'La preparación cambió. Actualiza el pedido antes de continuar');
    if(order.stock_policy==='reserved'&&order.inventory_allocated){
      for(const line of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id)){
        const v=requireVariant(db,line.variant_id);
        if(v.reserved<line.qty)fail(409,'La reserva requiere revisión antes de cancelar la preparación');
        record(db,line.variant_id,'release',v.stock,v.stock,`Preparación cancelada PED-${String(order.number).padStart(5,'0')}`,actor,id,v.reserved-line.qty);
      }
    }
    db.prepare('UPDATE order_items SET checked_qty=0 WHERE order_id=?').run(id);
    db.prepare("UPDATE orders SET status='pending',preparation_started_at=NULL,packed_at=NULL,inventory_allocated=0 WHERE id=?").run(id);
    db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,'preparation_cancelled',actor,now());
    return {id,status:'pending'};
  });
}
export function completePreparation(db,id,input,actor) {
  if(!Array.isArray(input.items)||!input.items.length)fail(400,'Confirma los productos del pedido');
  const items=input.items.map(i=>({id:text(i.id,'Línea',80,true),qty:integer(i.qty,'Cantidad',1)})).sort((a,b)=>a.id.localeCompare(b.id));
  return operation(db,actor,input.request_id,{id,action:'complete-preparation',items},()=>{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if(!order)fail(404,'Pedido no encontrado');
    if(order.status==='cancelled')fail(409,'El pedido fue cancelado');
    const lines=db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
    const expected=lines.map(i=>({id:i.id,qty:i.qty})).sort((a,b)=>a.id.localeCompare(b.id));
    if(JSON.stringify(items)!==JSON.stringify(expected))fail(409,'Los productos o cantidades cambiaron; revisa el pedido de nuevo');
    if(order.status==='packed')return {id,status:'packed'};
    requireSupportResolved(db,id);beginPreparation(db,order,actor);
    for(const line of lines){
      if(line.checked_qty<line.qty){db.prepare('UPDATE order_items SET checked_qty=qty WHERE id=?').run(line.id);db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,line.id,'verified',actor,now());}
      if(order.stock_policy==='reserved'){const v=requireVariant(db,line.variant_id);record(db,line.variant_id,'packing',v.stock,v.stock-line.qty,`Empaque PED-${String(order.number).padStart(5,'0')}`,actor,id,v.reserved-line.qty);}
    }
    const finished=now();db.prepare("UPDATE orders SET status='packed',packed_at=? WHERE id=?").run(finished,id);
    db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,'packed',actor,finished);enqueuePreparedJumpseller(db,id);enqueueEvolutPreparation(db,id);
    return {id,status:'packed'};
  });
}
export function deliverPickup(db,id,input,actor){
 const preparedAt=text(input.packed_at,'Preparación del pedido',40,true);
 return operation(db,actor,input.request_id,{id,action:'deliver-pickup',preparedAt},()=>{
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!order)fail(404,'Pedido no encontrado');
  if(order.status!=='packed'||order.packed_at!==preparedAt)fail(409,'El pedido debe estar listo para retirar. Actualiza antes de continuar');
  const saved=db.prepare('SELECT payload FROM external_order_details WHERE order_id=?').get(id),external=saved?JSON.parse(saved.payload):null;
  if(!isLocalPickup({...order,external}))fail(409,'Esta acción corresponde solo a retiro en local');
  if(order.pickup_delivered_at)return {id,pickup_delivered_at:order.pickup_delivered_at};
  if(order.platform==='Jumpseller'&&(external?.requires_review||external?.source_status&&external.source_status!=='Paid'))fail(409,'El pedido de Jumpseller requiere revisión antes de confirmar el retiro');
  if((external?.fulfilled_in_origin||external?.fulfillment_status==='fulfilled')&&!(order.platform==='Jumpseller'&&jumpsellerPickupAvailable(external)))fail(409,'La entrega ya avanzó en origen; revisa antes de registrar otro retiro');
  requireSupportResolved(db,id);
  const stamp=now();db.prepare('UPDATE orders SET pickup_delivered_at=?,pickup_delivered_by=? WHERE id=?').run(stamp,actor,id);
  db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,'pickup_delivered',actor,stamp);enqueueDeliveredJumpseller(db,id);
  return {id,pickup_delivered_at:stamp};
 });
}
export function createOrder(db,input,actor) {
  const platform=text(input.platform??'Manual','Origen',40,true);
  if(!['Manu','Manual','Dropi','Dropea','Evolut','Jumpseller','Walmart'].includes(platform)) fail(400,'Origen de pedido inválido');
  const external_reference=text(input.external_reference,'Referencia de pedido',100,true),customer_name=text(input.customer_name??'Cliente','Cliente',200,true);
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>100) fail(400,'Pedido sin líneas válidas');
  const items=input.items.map(i=>({id:text(i.id,'Variante',80,true),qty:integer(i.qty,'Cantidad',1)}));
  if(new Set(items.map(i=>i.id)).size!==items.length) fail(400,'Variantes repetidas');
  return operation(db,actor,input.request_id,{platform,external_reference,customer_name,items},()=>{
    const resolved=items.map(item=>{const v=requireVariant(db,item.id);if(!v.active)fail(409,`Producto inactivo ${v.meibo_sku}`);const assignment=db.prepare('SELECT code,price FROM external_codes WHERE variant_id=? AND platform=?').get(item.id,platform);return {...item,source_code:assignment?.code??v.meibo_sku,unit_price:platform==='Manual'?v.price:assignment?.price??null};});
    const order=insertOrder(db,{platform,external_reference,customer_name,stock_policy:'reserved',items:resolved},actor);
    db.prepare('UPDATE orders SET inventory_allocated=0 WHERE id=?').run(order.id);
    if(!stockIssues(db,{...order,stock_policy:'reserved',inventory_allocated:0}).length){for(const item of resolved){const v=requireVariant(db,item.id);record(db,item.id,'reserve',v.stock,v.stock,`Reserva pedido PED-${String(order.number).padStart(5,'0')} · ${platform}`,actor,order.id,v.reserved+item.qty);}db.prepare('UPDATE orders SET inventory_allocated=1 WHERE id=?').run(order.id);}
    return order;
  });
}
export function packItem(db,orderId,input,actor) {
  const itemId=text(input.item_id,'Línea de pedido',80,true),variantId=text(input.variant_id,'Variante confirmada',80,true),quantity=integer(input.quantity,'Unidades verificadas',1);
  const code=text(input.code??'','Código verificado',120);
  return operation(db,actor,input.request_id,{orderId,itemId,variantId,quantity,code},()=>{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if(!order)fail(404,'Pedido no encontrado');
    if(order.status==='cancelled')fail(409,'El pedido fue cancelado');
    const item=db.prepare('SELECT * FROM order_items WHERE id=? AND order_id=?').get(itemId,orderId);
    if(!item||item.variant_id!==variantId||item.qty!==quantity)fail(409,'El producto o la cantidad no corresponde a esta línea');
    if(code){const v=requireVariant(db,variantId);const codes=db.prepare('SELECT code FROM external_codes WHERE variant_id=?').all(variantId);if(code.toLowerCase()!==v.meibo_sku.toLowerCase()&&!codes.some(c=>c.code.toLowerCase()===code.toLowerCase()))fail(409,'El código escaneado no corresponde al producto del pedido');}
    if(item.checked_qty===item.qty)return {id:orderId,status:order.status};
    beginPreparation(db,order,actor);
    db.prepare('UPDATE order_items SET checked_qty=qty WHERE id=?').run(item.id);
    db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),orderId,itemId,'verified',actor,now());
    const remaining=db.prepare('SELECT COUNT(*) n FROM order_items WHERE order_id=? AND checked_qty<qty').get(orderId).n;
    const status=remaining?'packing':'packed';if(!remaining)requireSupportResolved(db,orderId);
    if(!remaining&&order.stock_policy==='reserved') {
      for(const line of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(orderId)) {
        const v=requireVariant(db,line.variant_id);
        if(v.stock<line.qty||v.reserved<line.qty)fail(409,'Inventario reservado inconsistente; solicita revisión');
        record(db,line.variant_id,'packing',v.stock,v.stock-line.qty,`Empaque PED-${String(order.number).padStart(5,'0')}`,actor,orderId,v.reserved-line.qty);
      }
    }
    db.prepare('UPDATE orders SET status=?,packed_at=? WHERE id=?').run(status,remaining?null:now(),orderId);
    if(!remaining){db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),orderId,null,'packed',actor,now());enqueuePreparedJumpseller(db,orderId);enqueueEvolutPreparation(db,orderId);}
    return {id:orderId,status};
  });
}
export function cancelOrder(db,id,input,actor) {
  return operation(db,actor,input.request_id,{id,action:'cancel'},()=>{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if(!order)fail(404,'Pedido no encontrado');
    if(order.stock_policy==='deducted')fail(409,'Una venta pagada requiere devolución; no se cancela desde empaque');
    if(order.status==='packed')fail(409,'Pedido ya empaquetado');
    if(order.status==='cancelled')return {id,status:'cancelled'};
    if(order.inventory_allocated)for(const line of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id)) {const v=requireVariant(db,line.variant_id);record(db,line.variant_id,'release',v.stock,v.stock,`Cancelación PED-${String(order.number).padStart(5,'0')}`,actor,id,v.reserved-line.qty);}
    db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(id);
    db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,'cancelled',actor,now());cancelOrderSupport(db,id,actor);
    return {id,status:'cancelled'};
  });
}

export function importBatches(db) {
  return db.prepare('SELECT * FROM catalog_import_batches ORDER BY created_at DESC').all().map(batch=>({...batch,rows:db.prepare('SELECT * FROM catalog_import_rows WHERE batch_id=? ORDER BY row_number').all(batch.id).map(row=>({...row,payload:JSON.parse(row.payload_json),payload_json:undefined}))}));
}
export function importBatchSummaries(db){
 return db.prepare("SELECT b.*,COUNT(r.id) row_count,COALESCE(SUM(CASE WHEN r.status='ready' THEN 1 ELSE 0 END),0) ready_count FROM catalog_import_batches b LEFT JOIN catalog_import_rows r ON r.batch_id=b.id GROUP BY b.id ORDER BY b.created_at DESC").all();
}
export function importBatch(db,id){
 const batch=db.prepare('SELECT * FROM catalog_import_batches WHERE id=?').get(id);if(!batch)fail(404,'Importación no encontrada');
 return {...batch,rows:db.prepare('SELECT * FROM catalog_import_rows WHERE batch_id=? ORDER BY row_number').all(id).map(row=>({...row,payload:JSON.parse(row.payload_json),payload_json:undefined}))};
}
export function stageImport(db,input,actor) {
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>500)fail(400,'Importación: entre 1 y 500 filas');
  const source=text(input.source??'Catálogo Nexora','Origen',200,true);
  return transaction(db,()=>{
    const id=uuid();db.prepare('INSERT INTO catalog_import_batches VALUES (?,?,?,?,?)').run(id,source,actor,'preview',now());
    const existing=catalog(db),seen=new Set();
    input.rows.forEach((raw,index)=>{
      let status='ready',error='',payload={};
      try {
        payload={name:text(raw.name,'Nombre',200,true),description:text(raw.description??'','Descripción',2000),category:text(raw.category??'','Categoría',100),image_url:safeUrl(raw.image_url,'Imagen'),source_url:safeUrl(raw.source_url,'Origen'),attributes:text(raw.attributes??'Presentación publicada','Variante',200),price:integer(raw.price,'Precio'),stock:0,is_demo:false,stock_confirmed:false,reason:'Catálogo autorizado: stock físico pendiente de confirmar',source_code:text(raw.source_code??'','Código visible de origen',120)};
        if(!payload.source_url)fail(400,'Falta URL de trazabilidad');
        const key=payload.source_url+'|'+payload.attributes;
        if(seen.has(key)||existing.some(p=>!p.is_demo&&p.source_url===payload.source_url&&p.attributes===payload.attributes)){status='duplicate';error='Producto/variante ya registrado; conserva su SKU';}
        seen.add(key);
      } catch(e){status='error';error=e.message;}
      db.prepare('INSERT INTO catalog_import_rows(id,batch_id,row_number,payload_json,status,error) VALUES (?,?,?,?,?,?)').run(uuid(),id,index+1,JSON.stringify(payload),status,error);
    });
    return {id};
  });
}
export function commitImport(db,id,actor) {
  const batch=db.prepare('SELECT * FROM catalog_import_batches WHERE id=?').get(id);
  if(!batch)fail(404,'Importación no encontrada');
  for(const row of db.prepare("SELECT * FROM catalog_import_rows WHERE batch_id=? AND status='ready'").all(id)) {
    const payload=JSON.parse(row.payload_json);
    const existing=catalog(db).find(p=>!p.is_demo&&p.source_url===payload.source_url&&p.attributes===payload.attributes);
    const parent=db.prepare('SELECT id FROM products WHERE source_url=? AND is_demo=0').get(payload.source_url);
    const variant=existing??createVariant(db,{...payload,...(parent?{product_id:parent.id}:{})},actor);
    db.prepare("UPDATE catalog_import_rows SET status='imported',variant_id=? WHERE id=?").run(variant.id,row.id);
  }
  db.prepare("UPDATE catalog_import_batches SET status='committed' WHERE id=?").run(id);
  return {id};
}
export function demoOrder(db,input,actor) {
  const request_id=text(input.request_id,'Referencia',100,true);
  const shortage=input.scenario==='shortage';
  const sources=catalog(db).filter(p=>!p.is_demo&&p.active).slice(0,3);
  if(!sources.length)fail(409,'Importa primero el catálogo autorizado para preparar el ejemplo Manu');
  const items=sources.map((source,index)=>{
    const attributes=(shortage?'DEMO Manu · Faltante · ':'DEMO Manu · ')+source.attributes;
    let demo=catalog(db).find(p=>p.is_demo&&p.source_url===source.source_url&&p.attributes===attributes);
    if(!demo)demo=createVariant(db,{...source,sku:'',product_id:undefined,is_demo:true,attributes,presentation:attributes,color:'',size:'',stock:shortage&&index===2?0:20,stock_confirmed:true,reason:shortage?'Escenario DEMO de faltante: tercera línea sin stock; no representa inventario real':'20 unidades ficticias para escenario Manu; no representan stock real'},actor);
    const code='MN-'+demo.sku;
    if(!db.prepare('SELECT id FROM external_codes WHERE variant_id=? AND platform=?').get(demo.id,'Manu'))addCode(db,demo.id,{platform:'Manu',code,origin:'Escenario local Manu; sin conexión externa'});
    return {id:demo.id,qty:index===1?2:1};
  });
  return createOrder(db,{platform:'Manu',external_reference:'MANU-DEMO-'+request_id.slice(0,8),customer_name:'Cliente demostración Manu',items,request_id},actor);
}

// --- DX TOOLS PUBLIC STOREFRONT API ---
export function storeProducts(db, query = {}) {
  const q = (query.q || '').trim().toLowerCase();
  const category = (query.category || '').trim();
  const onlyTools = query.onlyTools === 'true' || query.onlyTools === true || query.tools === 'true';
  const limit = Math.min(Number(query.limit || 50), 200);
  const page = Math.max(Number(query.page || 1), 1);
  const offset = (page - 1) * limit;
  const whereClauses = ['v.active = 1'];
  const params = [];
  if (onlyTools) whereClauses.push("v.meibo_sku LIKE 'NEXO-DX-%'");
  if (category && category !== 'Todas' && category !== 'all' && category !== 'Todo el Catálogo') {
    whereClauses.push('(p.category LIKE ? OR v.attributes LIKE ?)');
    params.push(`%${category}%`, `%${category}%`);
  }
  if (q) {
    whereClauses.push('(LOWER(p.name) LIKE ? OR LOWER(v.meibo_sku) LIKE ? OR LOWER(p.description) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const totalCount = db.prepare(`SELECT COUNT(*) as c FROM variants v JOIN products p ON p.id = v.product_id ${whereStr}`).get(...params).c;
  const rows = db.prepare(`
    SELECT v.id, v.product_id, v.meibo_sku as sku, v.attributes, v.price,
      p.name, p.description, p.category, p.image_url, p.source_url,
      i.on_hand as stock, i.reserved
    FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN inventory i ON i.variant_id = v.id
    ${whereStr}
    ORDER BY CASE WHEN v.meibo_sku LIKE 'NEXO-DX-%' THEN 0 ELSE 1 END, v.meibo_sku ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const codes = db.prepare(`SELECT variant_id, platform, code, price as cost FROM external_codes WHERE platform IN ('Dropea', 'Zaga Imp', 'DX Tools')`).all();
  const costMap = new Map();
  for (const c of codes) { if (c.cost) costMap.set(c.variant_id, c.cost); }
  const products = rows.map(r => {
    const wholesale_cost = costMap.get(r.id) || Math.round(r.price * 0.65);
    const isDx = r.sku.startsWith('NEXO-DX-');
    return {
      id: r.id, product_id: r.product_id, sku: r.sku, name: r.name, description: r.description, category: r.category,
      price: r.price, wholesale_cost, savings: Math.max(0, Math.round(r.price * 1.35) - r.price),
      reference_price: Math.round(r.price * 1.35 / 1000) * 1000 - 10,
      image_url: r.image_url || 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80',
      stock: r.stock || 0, in_stock: (r.stock - (r.reserved || 0)) > 0, is_dx: isDx,
      brand: isDx ? 'DX Tools' : 'NEXO',
      badge: isDx ? (r.name.includes('21V') || r.name.includes('48V') ? 'SERIE BATERÍA 21V/48V' : r.name.includes('Brushless') ? 'MOTOR BRUSHLESS' : 'ALTO RENDIMIENTO') : 'CATÁLOGO OFICIAL'
    };
  });
  return { page, limit, total: totalCount, total_pages: Math.ceil(totalCount / limit), products };
}

export function storeCreateOrder(db, input) {
  const customer_name = text(input.customer_name, 'Nombre de cliente', 120, true);
  const customer_phone = text(input.customer_phone, 'Teléfono / WhatsApp', 30, true);
  const customer_address = text(input.customer_address || '', 'Dirección', 250);
  const customer_commune = text(input.customer_commune || '', 'Comuna', 100);
  const customer_city = text(input.customer_city || '', 'Ciudad / Región', 100);
  const payment_method = text(input.payment_method || 'Contraentrega / Transferencia', 'Método de pago', 50);
  const notes = text(input.notes || '', 'Notas adicionales', 300);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) fail(400, 'El carrito está vacío. Agrega al menos un producto.');
  return transaction(db, () => {
    const adminUser = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
    const actorId = adminUser ? adminUser.id : uuid();
    const lastOrder = db.prepare('SELECT MAX(number) as n FROM orders').get();
    const nextNumber = (lastOrder?.n || 1000) + 1;
    const orderId = uuid();
    const extRef = `DX-WEB-${nextNumber}-${randomBytes(2).toString('hex').toUpperCase()}`;
    const createdAt = now();
    let total = 0;
    const resolvedItems = [];
    for (const item of rawItems) {
      const variantId = text(item.variant_id || item.id, 'ID de variante', 60, true);
      const qty = integer(Number(item.qty || 1), 'Cantidad', 1);
      const variant = db.prepare(`SELECT v.id, v.meibo_sku as sku, v.price, p.name, i.on_hand, i.reserved FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.id = ? AND v.active = 1`).get(variantId);
      if (!variant) fail(404, `Producto no encontrado o inactivo (ID: ${variantId})`);
      const unitPrice = variant.price, subtotal = unitPrice * qty;
      total += subtotal;
      db.prepare(`UPDATE inventory SET reserved = reserved + ? WHERE variant_id = ?`).run(qty, variantId);
      resolvedItems.push({ variant_id: variantId, sku: variant.sku, name: variant.name, qty, unit_price: unitPrice, subtotal });
    }
    db.prepare(`INSERT INTO orders (id, number, platform, external_reference, customer_name, status, stock_policy, actor_id, created_at, inventory_allocated) VALUES (?, ?, 'DX Storefront', ?, ?, 'pending', 'reserved', ?, ?, 1)`).run(orderId, nextNumber, extRef, `${customer_name} (${customer_phone})`, actorId, createdAt);
    for (const item of resolvedItems) {
      db.prepare(`INSERT INTO order_items (id, order_id, variant_id, qty, checked_qty, source_code, unit_price) VALUES (?, ?, ?, ?, 0, ?, ?)`).run(uuid(), orderId, item.variant_id, item.qty, item.sku, item.unit_price);
    }
    const formattedTotal = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(total);
    const itemListText = resolvedItems.map((it, idx) => `${idx + 1}. *${it.name}* (SKU: ${it.sku})\n   Cantidad: ${it.qty} x $${it.unit_price.toLocaleString('es-CL')} = $${it.subtotal.toLocaleString('es-CL')}`).join('\n\n');
    const waMessage = `⚡ *NUEVO PEDIDO DX TOOLS CHILE*\n━━━━━━━━━━━━━━━━━━━━\n📄 *Orden:* #${nextNumber} (${extRef})\n👤 *Cliente:* ${customer_name}\n📱 *Teléfono:* ${customer_phone}\n📍 *Despacho:* ${customer_address || 'Por coordinar'}, ${customer_commune || ''} ${customer_city ? '(' + customer_city + ')' : ''}\n💳 *Pago:* ${payment_method}\n${notes ? '📝 *Notas:* ' + notes + '\n' : ''}━━━━━━━━━━━━━━━━━━━━\n📦 *HERRAMIENTAS SOLICITADAS:*\n${itemListText}\n━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL A PAGAR: ${formattedTotal}*\n\n✅ _Hola, confirmo mi pedido generado en la tienda DX Tools. ¿Tienen disponibilidad para despacho inmediato?_`;
    const sellerPhone = process.env.DX_WHATSAPP_PHONE || '56930825227';
    return {
      ok: true, order_id: orderId, order_number: nextNumber, external_reference: extRef, customer_name, customer_phone, total,
      formatted_total: formattedTotal, items_count: resolvedItems.length, items: resolvedItems,
      whatsapp_url: `https://wa.me/${sellerPhone}?text=${encodeURIComponent(waMessage)}`, whatsapp_message: waMessage
    };
  });
}

export function storeWebhook(db, payload) {
  return { ok: true, event: payload?.event || 'generic_notification', received_at: now() };
}
