import {readFile} from 'node:fs/promises';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {fail} from './service.mjs';
import {now} from './database.mjs';
import {fetchEnviosUrbanosShipment,connectEnviosUrbanosShipment,enviosUrbanosCode} from './envios-urbanos.mjs';
const validId=id=>typeof id==='string'&&/^[a-z0-9]{15,40}$/.test(id);
export function enviosUrbanosEventInfo(payload){
 const type=typeof payload.type==='string'?payload.type:typeof payload.event==='string'?payload.event:payload.event?.type??payload.eventType??'';
 const id=payload.data?.shipmentId??payload.data?.shipment?.id??payload.shipmentId??payload.shipment?.id??payload.data?.id;
 return {type:String(type).slice(0,100),shipment_id:validId(id)?id:''};
}
export async function receiveEnviosUrbanosWebhook(db,raw,signature,deliveryId){
 if(!Buffer.isBuffer(raw)||raw.length>262144)fail(413,'Notificación demasiado grande');
 const c=JSON.parse(await readFile(process.env.MEIBO_PUBLISH_CREDENTIALS??'/data/publishing-credentials.json','utf8')),secret=c.EnviosUrbanos?.webhook_secret;
 if(!secret)fail(503,'Recepción de Envíos Urbanos pendiente de activar');
 const sig=String(signature??'').replace(/^sha256=/,'');if(!/^[a-f0-9]{64}$/i.test(sig)||!timingSafeEqual(createHmac('sha256',secret).update(raw).digest(),Buffer.from(sig,'hex')))fail(401,'Firma de notificación no válida');
 let payload;try{payload=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Notificación inválida');}if(!payload||typeof payload!=='object'||Array.isArray(payload))fail(400,'Notificación inválida');
 const info=enviosUrbanosEventInfo(payload),hash=createHash('sha256').update(raw).digest('hex'),id=typeof deliveryId==='string'&&deliveryId.length<=200?deliveryId:hash;
 const status=info.type==='webhook.test'?'ignored':info.type.startsWith('shipment.')&&info.shipment_id?'queued':'review';
 const inserted=db.prepare('INSERT OR IGNORE INTO envios_urbanos_webhook_events(id,body_hash,event_type,shipment_id,payload,received_at,status,error) VALUES (?,?,?,?,?,?,?,?)').run(id,hash,info.type,info.shipment_id,JSON.stringify(payload),now(),status,status==='review'?'Formato de notificación pendiente de adaptar':'');
 return {received:true,duplicate:!inserted.changes};
}
const running=new WeakMap();
export function processEnviosUrbanosEvents(db){
 if(running.has(db))return running.get(db);
 const task=(async()=>{
  const rows=db.prepare("SELECT * FROM envios_urbanos_webhook_events WHERE status IN ('queued','waiting') AND next_attempt_at<=? ORDER BY next_attempt_at,received_at LIMIT 5").all(Date.now());
  for(const row of rows){
   if(!db.prepare("UPDATE envios_urbanos_webhook_events SET status='processing',attempts=attempts+1 WHERE id=? AND status IN ('queued','waiting')").run(row.id).changes)continue;
   try{
    const shipment=await fetchEnviosUrbanosShipment(row.shipment_id),code=String(shipment.trackingCode??'').toUpperCase();
    const matches=db.prepare("SELECT order_id,payload FROM external_order_details WHERE platform='Jumpseller'").all().filter(r=>enviosUrbanosCode(JSON.parse(r.payload))===code&&code);
    if(matches.length!==1){if(matches.length>1){db.prepare("UPDATE envios_urbanos_webhook_events SET status='review',error='El seguimiento coincide con varios pedidos' WHERE id=?").run(row.id);continue;}throw Error('El pedido todavía no se encuentra en MEIBO');}
    await connectEnviosUrbanosShipment(db,matches[0].order_id,row.shipment_id);
    db.prepare("UPDATE envios_urbanos_webhook_events SET status='processed',processed_at=?,order_id=?,error='' WHERE id=?").run(now(),matches[0].order_id,row.id);
   }catch(e){const expired=Date.now()-Date.parse(row.received_at)>36*3600000||row.attempts>=100;const mismatch=/no coincide|otro envío|ya tiene|dirección|destinatario/i.test(e.message);db.prepare('UPDATE envios_urbanos_webhook_events SET status=?,next_attempt_at=?,error=? WHERE id=?').run(expired||mismatch?'review':'waiting',Date.now()+Math.min(15,Math.pow(2,Math.min(row.attempts,4)))*60000,mismatch?'Los datos del envío requieren revisión':expired?'No se pudo vincular el envío dentro del plazo':'Esperando el pedido o la disponibilidad de su etiqueta',row.id);}
  }
 })().finally(()=>running.delete(db));running.set(db,task);return task;
}
export function startEnviosUrbanosWorker(db){
 // Recover interrupted jobs after a process restart; the PDF link operation is idempotent.
 db.prepare("UPDATE envios_urbanos_webhook_events SET status='waiting' WHERE status='processing'").run();
 let stopped=false,timer;const run=async()=>{try{await processEnviosUrbanosEvents(db);}catch{console.error(JSON.stringify({event:'envios_urbanos_queue_error'}));}finally{if(!stopped){timer=setTimeout(run,60000);timer.unref();}}};timer=setTimeout(run,5000);timer.unref();return ()=>{stopped=true;clearTimeout(timer);};
}
