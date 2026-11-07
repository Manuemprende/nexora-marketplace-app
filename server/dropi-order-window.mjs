import {fail} from './service.mjs';
import {createHash} from 'node:crypto';
import {transaction,uuid} from './database.mjs';
import {dropiReadOrderSession} from './dropi-oauth.mjs';
import {dropiWindow} from './dropi-date-window.mjs';
import {mcpTable,syncMcpRecentDropi} from './dropi-recent-orders.mjs';
export {dropiWindow} from './dropi-date-window.mjs';
export async function captureDropiWindow(list,{from,until,delayMs=600}={}){
 const seen=new Map();let pages=0,duplicates=0;
 // Two complete passes reconcile offsets that move when new orders arrive.
 for(let pass=0;pass<2;pass++){
  let ended=false;
  for(let start=0;start<100000;start+=100){
   const rows=mcpTable(await list({from,until,start,result_number:100}),'items');pages++;
   for(const row of rows){if(!/^\d+$/.test(row.order_id)||!/^\d{4}-\d{2}-\d{2}/.test(row.created_at??''))throw Error('Pedido MCP sin ID o fecha válida');const day=row.created_at.slice(0,10);if(day<from||day>until)throw Error('Dropi devolvió pedidos fuera del rango solicitado');if(seen.has(row.order_id))duplicates++;seen.set(row.order_id,row);}
   if(rows.length<100){ended=true;break;}
   if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
  }
  if(!ended)throw Error('Paginación Dropi incompleta; no se publica una captura parcial');
 }
 return {rows:[...seen.values()].sort((a,b)=>Number(b.order_id)-Number(a.order_id)),pages,duplicates,complete:true};
}
const fingerprint=row=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
export function stageDropiWindow(db,rows,actor){
 return transaction(db,()=>{
  const stamp=new Date().toISOString(),put=db.prepare('INSERT INTO dropi_order_window(external_id,source_date,payload,fingerprint,observed_at) VALUES(?,?,?,?,?) ON CONFLICT(external_id) DO UPDATE SET source_date=excluded.source_date,payload=excluded.payload,fingerprint=excluded.fingerprint,observed_at=excluded.observed_at'),header=db.prepare("INSERT INTO external_order_previews(id,platform,external_id,payload,captured_at,actor_id,source_date) VALUES(?,'Dropi',?,?,?,?,?) ON CONFLICT(platform,external_id) DO NOTHING");
  for(const row of rows){
   const day=row.created_at.slice(0,10),total=Number(row.total);if(row.total==null||row.total===''||!Number.isFinite(total)||total<0)throw Error('Total del listado Dropi inválido');
   put.run(row.order_id,day,JSON.stringify(row),fingerprint(row),stamp);
   const payload={detail_pending:true,order_id:row.order_id,status:row.status,created_at:row.created_at,customer:{name:row.customer_name,phone:row.customer_phone,city:row.city,address:''},items:[],total,currency:row.currency,shipping_company:row.shipping_company,tracking_code:'',rate_type:row.rate_type};
   header.run(uuid(),row.order_id,JSON.stringify(payload),stamp,actor,day);
  }
  return rows.length;
 });
}
export async function syncDropiWindow(db,{rows,detail,actor,maxDetails=30,from,until}){
 stageDropiWindow(db,rows,actor);
 const selected=db.prepare("SELECT * FROM dropi_order_window WHERE source_date BETWEEN ? AND ? AND (detail_fingerprint IS NULL OR detail_fingerprint<>fingerprint OR detail_at<?) AND (last_error IS NULL OR attempted_at<?) ORDER BY CASE WHEN detail_fingerprint IS NULL THEN 0 WHEN detail_fingerprint<>fingerprint THEN 1 ELSE 2 END,COALESCE(attempted_at,''),CAST(external_id AS INTEGER) DESC LIMIT ?").all(from,until,new Date(Date.now()-3600000).toISOString(),new Date(Date.now()-900000).toISOString(),maxDetails);
 const byId=new Map(selected.map(r=>[r.external_id,r]));
 const result=await syncMcpRecentDropi(db,{rows:selected.map(r=>JSON.parse(r.payload)),detail,actor,maxNew:maxDetails,concurrency:2,preserveInputOrder:true,onProcessed(id,error){const row=byId.get(id),stamp=new Date().toISOString();if(error)db.prepare('UPDATE dropi_order_window SET attempted_at=?,last_error=? WHERE external_id=?').run(stamp,error,id);else db.prepare('UPDATE dropi_order_window SET detail_fingerprint=?,detail_at=?,attempted_at=?,last_error=NULL WHERE external_id=?').run(row.fingerprint,stamp,stamp,id);}});
 const pending=db.prepare('SELECT COUNT(*) n FROM dropi_order_window WHERE source_date BETWEEN ? AND ? AND (detail_fingerprint IS NULL OR detail_fingerprint<>fingerprint)').get(from,until).n;
 const stored=db.prepare("SELECT COUNT(*) n FROM external_order_previews WHERE platform='Dropi' AND source_date BETWEEN ? AND ?").get(from,until).n;
 return {...result,listed:rows.length,stored,pending_details:pending,window_complete:pending===0};
}

const pendingReads=new WeakMap();
export async function loadDropiOrderDetail(db,id,actor,{reader=dropiReadOrderSession}={}){
 if(!/^\d+$/.test(id))throw Error('Pedido Dropi inválido');const range=dropiWindow(),row=db.prepare('SELECT * FROM dropi_order_window WHERE external_id=? AND source_date BETWEEN ? AND ?').get(id,range.from,range.until);if(!row)throw Error('Pedido Dropi fuera del listado de ayer y hoy');
 if(!pendingReads.has(db))pendingReads.set(db,new Map());const reads=pendingReads.get(db);if(reads.has(id))return reads.get(id);
 const job=(async()=>{const detail=await reader(),result=await syncMcpRecentDropi(db,{rows:[JSON.parse(row.payload)],detail,actor,maxNew:1,onProcessed(ref,error){const stamp=new Date().toISOString();if(error)db.prepare('UPDATE dropi_order_window SET attempted_at=?,last_error=? WHERE external_id=?').run(stamp,error,ref);else db.prepare('UPDATE dropi_order_window SET detail_fingerprint=?,detail_at=?,attempted_at=?,last_error=NULL WHERE external_id=?').run(row.fingerprint,stamp,stamp,ref);}});if(result.errors.length)fail(409,result.errors[0].message);return {ok:true};})();reads.set(id,job);try{return await job;}finally{reads.delete(id);}
}
