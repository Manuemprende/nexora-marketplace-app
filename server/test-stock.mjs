import {now,transaction} from './database.mjs';
import {record,fail} from './service.mjs';
export function enableTestStock(db,actor,{minimum=100,batch}={}){
 if(!Number.isSafeInteger(minimum)||minimum<1||minimum>100000)fail(400,'Mínimo de prueba inválido');
 if(!/^TEST-STOCK-[A-Z0-9-]{5,80}$/.test(batch??''))fail(400,'Referencia de lote de prueba obligatoria');
 if(!db.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND active=1").get(actor))fail(403,'Administrador activo obligatorio');
 return transaction(db,()=>{
  const fingerprint=JSON.stringify({kind:'temporary-test-stock',minimum,batch}),previous=db.prepare('SELECT fingerprint,result_json FROM operations WHERE request_id=?').get(batch);
  if(previous){if(previous.fingerprint!==fingerprint)fail(409,'Lote ya utilizado con otro mínimo');return {...JSON.parse(previous.result_json),idempotent:true};}
  const rows=db.prepare('SELECT v.id,i.on_hand,i.reserved,i.stock_confirmed FROM variants v JOIN inventory i ON i.variant_id=v.id WHERE v.active=1').all();
  let adjusted=0,confirmed=0,added=0;
  for(const row of rows){const target=Math.max(row.on_hand,row.reserved+minimum);if(target!==row.on_hand||!row.stock_confirmed){record(db,row.id,'adjustment',row.on_hand,target,`Stock TEMPORAL para pruebas de MEIBO; mínimo ${minimum} disponibles. No corresponde a conteo físico real. Lote ${batch}.`,actor,batch,row.reserved);added+=target-row.on_hand;adjusted++;if(!row.stock_confirmed)confirmed++;db.prepare('UPDATE inventory SET stock_confirmed=1 WHERE variant_id=?').run(row.id);}}
  const result={batch,minimum,active_variants:rows.length,adjusted,confirmed,added,temporary:true};
  db.prepare('INSERT INTO operations VALUES (?,?,?,?)').run(batch,actor,fingerprint,JSON.stringify(result));return result;
 });
}
