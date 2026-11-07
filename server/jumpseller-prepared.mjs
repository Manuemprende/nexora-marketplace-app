import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {jumpsellerShipmentState,jumpsellerPickupAvailable} from './jumpseller-state.mjs';
export function preparedSyncConfig(db){const saved=db?.prepare('SELECT enabled,since FROM jumpseller_prepared_settings WHERE id=1').get(),since=saved?.enabled!=null?saved.since:process.env.MEIBO_JS_PREPARED_SINCE,enabled=(saved?.enabled!=null?saved.enabled===1:process.env.MEIBO_JS_PREPARED_SYNC==='1')&&!!since&&Number.isFinite(Date.parse(since));return {enabled,since:enabled?new Date(since).toISOString():null};}
export function setPreparedSyncConfig(db,enabled){if(typeof enabled!=='boolean')throw Error('Configuración inválida');const current=preparedSyncConfig(db);if(enabled===current.enabled)return current;db.prepare('UPDATE jumpseller_prepared_settings SET enabled=?,since=? WHERE id=1').run(enabled?1:0,enabled?new Date().toISOString():null);return preparedSyncStatus(db);}
export function enqueuePreparedJumpseller(db,id){
 const row=db.prepare("SELECT o.status,o.packed_at,d.external_id,d.payload FROM orders o JOIN external_order_details d ON d.order_id=o.id WHERE o.id=? AND d.platform='Jumpseller'").get(id);if(!row||row.status!=='packed'||!row.packed_at)return;
 const source=JSON.parse(row.payload),config=preparedSyncConfig(db),eligible=config.enabled&&Date.parse(row.packed_at)>=Date.parse(config.since),target=source.shipping_option==='store_pickup'&&!source.label_attachments?.length?'pickup_available':null;
 const status=!eligible?'disabled':target?'queued':'review',message=!eligible?'Actualización en Jumpseller desactivada':target?'Pendiente de confirmar disponibilidad para retiro':'Falta acordar el estado que corresponde a preparado para despacho';
 const stamp=new Date().toISOString();db.prepare('INSERT OR IGNORE INTO jumpseller_prepared_outbox VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,row.external_id,row.packed_at,target,status,message,stamp,stamp);
}
export function enqueueDeliveredJumpseller(db,id){
 const row=db.prepare("SELECT o.pickup_delivered_at,d.external_id FROM orders o JOIN external_order_details d ON d.order_id=o.id WHERE o.id=? AND o.status='packed' AND d.platform='Jumpseller'").get(id);if(!row?.pickup_delivered_at)return;
 const c=preparedSyncConfig(db),eligible=c.enabled&&Date.parse(row.pickup_delivered_at)>=Date.parse(c.since),stamp=new Date().toISOString();
 // The handover is a separate immutable event. Disabled events are never replayed at activation.
 db.prepare('INSERT OR IGNORE INTO jumpseller_prepared_outbox VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,row.external_id,'delivered:'+row.pickup_delivered_at,'delivered',eligible?'queued':'disabled',eligible?'Pendiente de confirmar entrega':'Actualización en Jumpseller desactivada',stamp,stamp);
}
export function preparedSyncStatus(db){const config=preparedSyncConfig(db);return {...config,description:config.enabled?'Actualización al preparar habilitada desde la fecha de corte':'Actualización al preparar desactivada; no modifica pedidos en Jumpseller',counts:db.prepare('SELECT status,COUNT(*) n FROM jumpseller_prepared_outbox GROUP BY status').all(),issues:db.prepare("SELECT x.order_id,o.number,x.external_id,x.status,x.message FROM jumpseller_prepared_outbox x JOIN orders o ON o.id=x.order_id WHERE x.status IN ('review','uncertain') ORDER BY x.updated_at DESC LIMIT 20").all()};}
async function request(path,method='GET',body){const c=JSON.parse(await readFile(process.env.MEIBO_PUBLISH_CREDENTIALS??'/data/publishing-credentials.json','utf8'));if(!c.Jumpseller?.login||!c.Jumpseller?.token)throw Error('Falta la conexión de Jumpseller');const r=await fetch('https://api.jumpseller.com/v1'+path,{method,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Basic '+Buffer.from(c.Jumpseller.login+':'+c.Jumpseller.token).toString('base64')},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Jumpseller HTTP '+r.status);return r.json();}
const shipmentStatus=jumpsellerShipmentState;
const lines=list=>(list??[]).map(x=>[String(x.id??x.product_id),String(x.variant_id??''),x.qty,x.price]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export async function processPreparedJumpseller(db,{remote=request}={}){
 const config=preparedSyncConfig(db);if(!config.enabled)return {disabled:true};
 const rows=db.prepare("SELECT * FROM jumpseller_prepared_outbox WHERE status IN ('queued','uncertain') ORDER BY updated_at LIMIT 5").all();
 for(const row of rows){
  const update=(status,message)=>db.prepare('UPDATE jumpseller_prepared_outbox SET status=?,message=?,updated_at=? WHERE id=?').run(status,message,new Date().toISOString(),row.id);
  const handover=row.target_status==='delivered',eventTime=handover?row.prepared_at.replace(/^delivered:/,''):row.prepared_at;
  if(Date.parse(eventTime)<Date.parse(config.since)){update('skipped','Preparación anterior a la activación');continue;}
  if(!db.prepare("UPDATE jumpseller_prepared_outbox SET status='checking' WHERE id=? AND status=?").run(row.id,row.status).changes)continue;
  let wrote=row.status==='uncertain';
  try{
   const local=db.prepare('SELECT o.status,o.packed_at,o.pickup_delivered_at,d.payload FROM orders o JOIN external_order_details d ON d.order_id=o.id WHERE o.id=?').get(row.order_id);
   if(!local||local.status!=='packed'||(handover?local.pickup_delivered_at:local.packed_at)!==eventTime){update('skipped','El pedido local cambió');continue;}
   const response=await remote('/orders/'+encodeURIComponent(row.external_id)+'.json'),source=response.order;
   if(!source||String(source.id)!==row.external_id||source.status!=='Paid'){update('review','El pedido en origen no coincide o ya no está pagado');continue;}
   if(shipmentStatus(source)===row.target_status){update('confirmed','Estado confirmado en Jumpseller');continue;}
   if(wrote){update('review','La respuesta anterior no se confirmó. Revisa en origen antes de repetir el cambio');continue;}
   const snapshot=JSON.parse(local.payload);
   if((source.fulfillment_status==='fulfilled'&&!(handover&&jumpsellerPickupAvailable(source)))||['in_transit','delivered','failed'].includes(shipmentStatus(source))){update('skipped','El despacho ya avanzó en origen');continue;}
   if(!['pickup_available','delivered'].includes(row.target_status)||source.shipping_option!=='store_pickup'||snapshot.label_attachments?.length||JSON.stringify(lines(source.products))!==JSON.stringify(lines(snapshot.lines))){update('review','Revisa modalidad y productos antes de actualizar Jumpseller');continue;}
   if(handover&&shipmentStatus(source)!=='pickup_available'){update('review','Confirma primero que el pedido esté listo para retirar en Jumpseller');continue;}
   // Recheck the switch immediately before the only external mutation.
   if(!preparedSyncConfig(db).enabled){update('disabled','Actualización desactivada antes del envío');continue;}
   update('sending','Enviando disponibilidad para retiro');wrote=true;
   await remote('/orders/'+encodeURIComponent(row.external_id)+'.json','PUT',{order:{shipment_status:row.target_status}});
   const check=await remote('/orders/'+encodeURIComponent(row.external_id)+'.json');if(String(check.order?.id)===row.external_id&&shipmentStatus(check.order)===row.target_status)update('confirmed','Estado confirmado en Jumpseller');else update('uncertain','Falta confirmar el estado devuelto por Jumpseller');
  }catch{update(wrote?'uncertain':'review',wrote?'Respuesta pendiente de conciliación; no se repetirá el envío automáticamente':'No se pudo validar el pedido en Jumpseller');}
 }
 return {disabled:false};
}
export function startPreparedJumpsellerWorker(db){if(!preparedSyncConfig(db).enabled)return ()=>{};db.prepare("UPDATE jumpseller_prepared_outbox SET status=CASE WHEN status='sending' THEN 'uncertain' ELSE 'queued' END WHERE status IN ('checking','sending')").run();let stopped=false,timer;const run=async()=>{try{await processPreparedJumpseller(db);}catch{console.error(JSON.stringify({event:'jumpseller_prepared_sync_error'}));}finally{if(!stopped){timer=setTimeout(run,60000);timer.unref();}}};timer=setTimeout(run,10000);timer.unref();return()=>{stopped=true;clearTimeout(timer);};}

