import {orderLabelAttachments} from './jumpseller-attachments.mjs';
import {now} from './database.mjs';
import {jumpsellerRequest,importJumpsellerSnapshot,shippingLabel} from './jumpseller-orders.mjs';

export function orderSyncStatus(db){
 const state=db.prepare("SELECT * FROM order_sync_state WHERE platform='Jumpseller'").get();
 const last=Date.parse(state?.finished_at??state?.started_at??'')||0,stale=!!state&&Date.now()-last>900000;
 return {platform:'Jumpseller',enabled:!!state,status:stale?'stale':state?.status??'not_started',started_at:state?.started_at??null,finished_at:state?.finished_at??null,summary:JSON.parse(state?.summary??'{}'),error:stale?'La recepción automática no se ha actualizado. La conexión requiere revisión.':state?.error??'',issues:db.prepare("SELECT i.external_id,i.local_id,i.error,i.updated_at,o.number FROM order_sync_inbox i LEFT JOIN orders o ON o.id=i.local_id WHERE i.platform='Jumpseller' AND i.status='review' ORDER BY i.updated_at DESC LIMIT 20").all().map(issue=>({...issue,products:issue.local_id?db.prepare('SELECT v.meibo_sku sku,p.name,oi.source_code,oi.qty FROM order_items oi JOIN variants v ON v.id=oi.variant_id JOIN products p ON p.id=v.product_id WHERE oi.order_id=? ORDER BY oi.rowid').all(issue.local_id):[]}))};
}
const signatures=lines=>JSON.stringify(lines.map(i=>[String(i.product_id??i.id),String(i.variant_id??''),Number(i.qty),Number(i.price)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export function refreshJumpsellerSnapshot(db,localId,source,fulfillments){
 const row=db.prepare("SELECT d.payload,d.external_id,o.status local_status FROM external_order_details d JOIN orders o ON o.id=d.order_id WHERE d.order_id=? AND d.platform='Jumpseller'").get(localId);if(!row||String(source.id)!==row.external_id)throw Error('ID de pedido distinto del esperado');
 const payload=JSON.parse(row.payload);
 const reason=source.status!=='Paid'?'El pedido dejó de estar pagado en Jumpseller.':source.fulfillment_status==='fulfilled'&&row.local_status!=='packed'?'El pedido fue despachado en Jumpseller. Revisa antes de prepararlo otra vez.':signatures(source.products??[])!==signatures(payload.lines??[])?'Los productos, cantidades o precios cambiaron en Jumpseller. Revisa el pedido.':'';
 Object.assign(payload,{additional_shipping_fields:(source.additional_fields??[]).filter(f=>f.area==='shipping').map(f=>({label:f.label,value:f.value})),label_attachments:orderLabelAttachments(source),source_status:source.status,fulfillment_status:source.fulfillment_status,shipment_status:source.shipment_status,shipment_status_enum:source.shipment_status_enum??null,requires_review:!!reason,review_reason:reason,source_checked_at:now(),fulfillments:fulfillments.map(f=>({id:f.id,type:f.type,tracking_company:f.tracking_company,tracking_number:f.tracking_number,shipment_status:f.shipment_status,label_available:!!f.label_url}))});
 if(!reason){payload.shipping_option=source.shipping_option??null;payload.pickup_address=source.pickup_address??null;payload.shipping_required=source.shipping_required??null;payload.shipping_address=source.shipping_address;payload.billing_address=source.billing_address;payload.shipping_method=source.shipping_method_name;payload.payment_method=source.payment_method_name;payload.shipping=source.shipping;payload.discount=source.discount;payload.total=source.total;payload.subtotal=source.subtotal;payload.customer={name:source.customer?.fullname||payload.customer.name,email:source.customer?.email??'',phone:source.customer?.phone??''};}
 db.prepare('UPDATE external_order_details SET payload=?,captured_at=? WHERE order_id=?').run(JSON.stringify(payload),now(),localId);
 return reason;
}

export async function syncJumpsellerOrders(db,actor,{request:requestImpl=jumpsellerRequest,label=shippingLabel,maxNew=10,maxRefresh=20,refreshIntervals={pending:300000,packing:120000,packed:1800000,review:1800000}}={}){
 const stamp=now(),stats={scanned:0,imported:0,review:0,labels_ready:0,labels_pending:0,pickups:0,deferred:0,refresh_skipped:0,refresh_deferred:0,api_requests:0};
 const request=async path=>{stats.api_requests++;return requestImpl(path);};
 db.prepare("INSERT INTO order_sync_state(platform,status,started_at) VALUES ('Jumpseller','running',?) ON CONFLICT(platform) DO UPDATE SET status='running',started_at=excluded.started_at,error=''").run(stamp);
 const snapshots=new Map(),visited=new Set();let complete=false;
 const saveInbox=(id,payload,status,localId=null,error='')=>db.prepare("INSERT INTO order_sync_inbox VALUES ('Jumpseller',?,?,?,?,?,?,?) ON CONFLICT(platform,external_id) DO UPDATE SET status=excluded.status,local_id=COALESCE(excluded.local_id,order_sync_inbox.local_id),payload=excluded.payload,error=excluded.error,updated_at=excluded.updated_at").run(String(id),status,localId,JSON.stringify(payload),error,stamp,now());
 const shipments=async id=>{const rows=await request('/order/'+id+'/fulfillments.json');if(!Array.isArray(rows))throw Error('Formato de despachos inválido');return rows.map(x=>x.order_fulfillment??x);};
 try{
  // Scan every paid, unfulfilled order, including old carts paid today.
  // No order-ID/date watermark that could silently lose those orders.
  for(let page=1;page<=100;page++){
   const rows=await request('/orders.json?'+new URLSearchParams({'status_filters[]':'paid',fulfillment_filters:'unfulfilled',limit:'100',page:String(page)}));
   if(!Array.isArray(rows))throw Error('Formato de pedidos inválido');
   for(const row of rows){const o=row.order??row;if(!Number.isSafeInteger(o.id))throw Error('Pedido sin ID válido');if(visited.has(o.id))continue;visited.add(o.id);stats.scanned++;if(o.status==='Paid'&&o.fulfillment_status!=='fulfilled')snapshots.set(String(o.id),o);}
   if(rows.length===0){complete=true;break;}
  }
  if(!complete)throw Error('El listado de pedidos superó el límite de revisión; no se importó una captura incompleta');
  for(const [externalId,snapshot] of snapshots){
   const existing=db.prepare("SELECT order_id FROM external_order_details WHERE platform='Jumpseller' AND external_id=?").get(externalId);if(existing)continue;
   if(stats.imported>=maxNew){stats.deferred++;saveInbox(externalId,snapshot,'pending');continue;}
   try{
    const response=await request('/orders/'+externalId+'.json'),o=response.order??response;
    if(String(o.id)!==externalId)throw Error('ID recibido distinto del pedido solicitado');
    if(o.status!=='Paid'||o.fulfillment_status==='fulfilled'){saveInbox(externalId,o,'skipped');continue;}
    const fs=o.shipping_option==='store_pickup'?[]:await shipments(externalId),result=importJumpsellerSnapshot(db,o,fs,actor);
    saveInbox(externalId,o,'imported',result.id);if(result.imported)stats.imported++;
   }catch(e){stats.review++;saveInbox(externalId,snapshot,'review',null,String(e.message).slice(0,1000));}
  }
  const active=db.prepare("SELECT o.id,o.status,d.external_id,d.payload FROM orders o JOIN external_order_details d ON d.order_id=o.id WHERE d.platform='Jumpseller' AND o.status IN ('pending','packing','packed') AND COALESCE(json_extract(d.payload,'$.fulfilled_in_origin'),0)=0").all();
  // Refresh preparation frequently; completed local packages need less polling.
  // Oldest checked rows run first so a bounded batch never starves older orders.
  active.sort((a,b)=>(Date.parse(JSON.parse(a.payload).source_checked_at)||0)-(Date.parse(JSON.parse(b.payload).source_checked_at)||0));
  let refreshed=0;
  for(const row of active){
   const previous=JSON.parse(row.payload),lastChecked=Date.parse(previous.source_checked_at)||0,interval=previous.requires_review?refreshIntervals.review:refreshIntervals[row.status];
   if(Date.now()-lastChecked<interval){stats.refresh_skipped++;continue;}
   if(refreshed>=maxRefresh){stats.refresh_deferred++;continue;}
   refreshed++;
   try{const response=await request('/orders/'+row.external_id+'.json'),o=response.order??response,fs=o.shipping_option==='store_pickup'?[]:await shipments(row.external_id);const reason=refreshJumpsellerSnapshot(db,row.id,o,fs);saveInbox(row.external_id,o,reason?'review':'imported',row.id,reason);if(reason){stats.review++;continue;}if(o.shipping_option==='store_pickup'&&!orderLabelAttachments(o).length){stats.pickups++;continue;}if(fs.length===1||orderLabelAttachments(o).length){try{await label(db,row.id);stats.labels_ready++;}catch{stats.labels_pending++;}}else stats.labels_pending++;}
   catch(e){stats.review++;saveInbox(row.external_id,{},'review',row.id,String(e.message).slice(0,1000));}
  }
  db.prepare("UPDATE order_sync_state SET status=?,finished_at=?,summary=?,error='' WHERE platform='Jumpseller'").run(stats.review?'review':'ok',now(),JSON.stringify(stats));
  return stats;
 }catch(e){db.prepare("UPDATE order_sync_state SET status='error',finished_at=?,summary=?,error=? WHERE platform='Jumpseller'").run(now(),JSON.stringify(stats),String(e.message).slice(0,1000));throw e;}
}
