import {now,uuid,transaction} from './database.mjs';
import {fail,text,record,requireVariant,integer} from './service.mjs';
import {evolutRequest,evolutPayload} from './evolut-orders.mjs';
const signature=items=>JSON.stringify((items??[]).map(i=>[String(i.product_id),typeof i.variant==='object'?String(i.variant?.id??''):String(i.variant??''),Number(i.quantity)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export function queueEvolutCancellation(db,id,input,actor){
 const preparedAt=text(input.packed_at,'Preparación',40,true),reason=text(input.reason,'Motivo',500,true);
 return transaction(db,()=>{
  const order=db.prepare("SELECT o.*,d.external_id FROM orders o JOIN external_order_details d ON d.order_id=o.id AND d.platform='Evolut' WHERE o.id=?").get(id);
  if(!order)fail(404,'Pedido Evolut no encontrado');
  const old=db.prepare('SELECT * FROM evolut_cancel_outbox WHERE order_id=?').get(id);
  if(old?.prepared_at===preparedAt)return {id,status:old.status,message:old.message};
  if(order.status!=='packed'||!order.packed_at||order.packed_at!==preparedAt||order.stock_policy!=='reserved')fail(409,'Solo puedes revertir una preparación terminada aquí; actualiza el pedido');
  if(db.prepare('SELECT status FROM evolut_prepare_outbox WHERE order_id=?').get(id)?.status!=='confirmed')fail(409,'Espera la confirmación de la preparación en Evolut antes de revertirla');
  db.prepare("INSERT INTO evolut_cancel_outbox VALUES (?,?,?,?,'queued','Cancelación pendiente de confirmar en Evolut',?) ON CONFLICT(order_id) DO UPDATE SET prepared_at=excluded.prepared_at,actor_id=excluded.actor_id,reason=excluded.reason,status=excluded.status,message=excluded.message,updated_at=excluded.updated_at").run(id,preparedAt,actor,reason,now());
  db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),id,null,'evolut_cancellation_requested',actor,now());
  return {id,status:'queued'};
 });
}
function finish(db,row,remote){
 return transaction(db,()=>{
  const current=db.prepare('SELECT * FROM evolut_cancel_outbox WHERE order_id=?').get(row.order_id);
  if(current.status==='confirmed')return;
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(row.order_id);
  if(order.status!=='packed'||order.packed_at!==row.prepared_at)throw Error('La preparación local cambió');
  for(const line of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id)){
   const variant=requireVariant(db,line.variant_id);
   record(db,line.variant_id,'entry',variant.stock,integer(variant.stock+line.qty,'Stock final'),`Reversión empaque Evolut · ${row.reason}`,row.actor_id,order.id);
  }
  db.prepare("UPDATE orders SET status='pending',preparation_started_at=NULL,packed_at=NULL,inventory_allocated=0 WHERE id=?").run(order.id);
  db.prepare('UPDATE order_items SET checked_qty=0 WHERE order_id=?').run(order.id);
  db.prepare('UPDATE external_order_details SET payload=?,captured_at=? WHERE order_id=?').run(JSON.stringify(evolutPayload(remote)),now(),order.id);
  db.prepare('DELETE FROM evolut_prepare_outbox WHERE order_id=?').run(order.id);
  db.prepare("UPDATE evolut_cancel_outbox SET status='confirmed',message='Preparación cancelada. Stock devuelto y guía conservada.',updated_at=? WHERE order_id=?").run(now(),order.id);
  db.prepare('INSERT INTO packing_events VALUES (?,?,?,?,?,?)').run(uuid(),order.id,null,'evolut_preparation_cancelled',row.actor_id,now());
 });
}
export async function processEvolutCancellations(db,{request=evolutRequest}={}){
 const rows=db.prepare("SELECT x.*,d.external_id,d.payload FROM evolut_cancel_outbox x JOIN external_order_details d ON d.order_id=x.order_id WHERE x.status IN ('queued','uncertain') LIMIT 5").all();
 for(const row of rows){
  const update=(status,message)=>db.prepare('UPDATE evolut_cancel_outbox SET status=?,message=?,updated_at=? WHERE order_id=?').run(status,message,now(),row.order_id);
  if(!db.prepare("UPDATE evolut_cancel_outbox SET status='checking' WHERE order_id=? AND status=?").run(row.order_id,row.status).changes)continue;
  let wrote=row.status==='uncertain';
  try{
   const local=db.prepare('SELECT status,packed_at FROM orders WHERE id=?').get(row.order_id);
   if(local.status!=='packed'||local.packed_at!==row.prepared_at)throw Error('La preparación local cambió');
   const path='/api/supplier/orders/'+encodeURIComponent(row.external_id),unwrap=r=>r.data??r;
   const check=remote=>String(remote.id)===row.external_id&&signature(remote.items)===signature(JSON.parse(row.payload).lines);
   let remote=unwrap(await request(path));
   if(!check(remote))throw Error('Los productos cambiaron en Evolut');
   if(remote.status==='pending'){finish(db,row,remote);continue;}
   if(remote.status!=='guide_generated')throw Error('Evolut ya no está en Guía generada; revisa su estado');
   if(wrote){update('review','Respuesta incierta. Revisa la cancelación en Evolut antes de repetir.');continue;}
   update('sending','Cancelando preparación en Evolut');wrote=true;
   await request(path+'/cancel-preparation',{method:'POST'});
   remote=unwrap(await request(path));
   if(!check(remote)||remote.status!=='pending'){update('uncertain','Cancelación enviada; falta confirmar el resultado en Evolut');continue;}
   finish(db,row,remote);
  }catch(e){update(wrote?'uncertain':'review',wrote?'Respuesta pendiente de conciliación. El stock local aún no se ha devuelto.':e.message);}
 }
}
