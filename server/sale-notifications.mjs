import {now,transaction} from './database.mjs';
import {fail} from './service.mjs';
const saleFields='s.rowid cursor,s.id,s.number,s.total,s.payment_method,s.created_at,u.email seller';
const started=db=>db.prepare('SELECT started_at FROM sale_notification_settings WHERE id=1').get().started_at;
export function saleNotificationInbox(db,userId){const where="s.status='completed' AND s.created_at>=? AND NOT EXISTS (SELECT 1 FROM sale_notification_reads r WHERE r.sale_id=s.id AND r.user_id=?)";const params=[started(db),userId];return {rows:db.prepare('SELECT '+saleFields+' FROM sales s JOIN users u ON u.id=s.actor_id WHERE '+where+' ORDER BY s.rowid DESC LIMIT 100').all(...params),total:db.prepare('SELECT COUNT(*) n FROM sales s WHERE '+where).get(...params).n,cursor:db.prepare('SELECT COALESCE(MAX(rowid),0) cursor FROM sales').get().cursor};}
export function readSaleNotifications(db,userId,input){const ids=input.sale_ids;if(input.all!==true&&(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string')))fail(400,'Selecciona los avisos que quieres marcar como vistos');if(input.all===true&&(!Number.isSafeInteger(input.through)||input.through<0))fail(400,'Referencia de avisos inválida');return transaction(db,()=>{const rows=input.all===true?db.prepare("SELECT id FROM sales WHERE status='completed' AND created_at>=? AND rowid<=?").all(started(db),input.through):db.prepare('SELECT id FROM sales WHERE id IN ('+ids.map(()=>'?').join(',')+') AND created_at>=?').all(...ids,started(db));const insert=db.prepare('INSERT OR IGNORE INTO sale_notification_reads(user_id,sale_id,read_at) VALUES (?,?,?)');for(const row of rows)insert.run(userId,row.id,now());return {ok:true};});}
// One event stream per open cashier window; no catalog polling or extra worker.
export function createSaleNotifications(db){
 const clients=new Set();
 const latest=()=>db.prepare('SELECT COALESCE(MAX(rowid),0) cursor FROM sales').get().cursor;
 function authorized(userId,sessionHash){
  const user=db.prepare('SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND u.active=1').get(sessionHash,userId,Date.now());
  return !!user&&(user.role==='admin'||!!db.prepare("SELECT 1 FROM user_permissions WHERE user_id=? AND section='cash'").get(userId));
 }
 function send(client,event,data,id){
  if(client.res.destroyed)return false;
  const ok=client.res.write(`${id===undefined?'':`id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if(!ok)client.res.end();return ok;
 }
 function pump(client){
  if(!authorized(client.userId,client.sessionHash)){send(client,'access-ended',{});client.res.end();return;}
  const rows=db.prepare(`SELECT s.rowid cursor,s.id,s.number,s.total,s.payment_method,s.created_at,u.email seller
    FROM sales s JOIN users u ON u.id=s.actor_id WHERE s.rowid>? AND s.status='completed' ORDER BY s.rowid LIMIT 100`).all(client.cursor);
  for(const sale of rows){if(!send(client,'sale',sale,sale.cursor))return;client.cursor=sale.cursor;}
 }
 return {
  connect(req,res,user,sessionHash,url){
   const maximum=latest(),raw=req.headers['last-event-id']??url.searchParams.get('after');
   const requested=raw===null||raw===undefined||raw===''?maximum:Number(raw);
   const cursor=Number.isSafeInteger(requested)&&requested>=0?Math.min(requested,maximum):maximum;
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
   res.flushHeaders();
   const client={res,userId:user.id,sessionHash,cursor};clients.add(client);
   send(client,'ready',{cursor},cursor);pump(client);
   const timer=setInterval(()=>{if(res.destroyed)return;try{pump(client);if(!res.writableEnded)res.write(': keepalive\n\n');}catch{res.end();}},15000);timer.unref();
   res.on('close',()=>{clearInterval(timer);clients.delete(client);});
  },
  changed(userId){for(const client of clients)if(client.userId===userId){if(authorized(client.userId,client.sessionHash))send(client,'inbox-changed',{});else client.res.end();}},
  publish(){for(const client of clients){try{pump(client);}catch{client.res.end();}}},
  close(){for(const client of clients)client.res.end();clients.clear();}
 };
}
