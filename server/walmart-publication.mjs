import {randomUUID} from 'node:crypto';
import {fail} from './service.mjs';
import {now} from './database.mjs';
import {buildWalmartFeed} from './walmart-schema.mjs';
const base='https://marketplace.walmartapis.com/v3';
let cached;
async function headers(c){
 if(!c?.client_id||!c?.client_secret)fail(409,'Faltan credenciales de Walmart Chile');
 const h={Accept:'application/json',WM_MARKET:'cl','WM_SVC.NAME':'Walmart Marketplace','WM_QOS.CORRELATION_ID':randomUUID(),'WM_GLOBAL_VERSION':'3.1'};
 if(!cached||cached.client!==c.client_id||cached.expires<Date.now()){
  const r=await fetch(base+'/token',{method:'POST',headers:{...h,Authorization:'Basic '+Buffer.from(c.client_id+':'+c.client_secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)fail(409,'Walmart no autorizó la conexión: HTTP '+r.status);
  const j=await r.json();if(!j.access_token)fail(502,'Walmart no devolvió un token de acceso');cached={client:c.client_id,token:j.access_token,expires:Date.now()+Math.max(0,(Number(j.expires_in)||900)-60)*1000};
 }
 return {...h,'WM_SEC.ACCESS_TOKEN':cached.token};
}
export async function publishWalmart(db,{p,d,row,link,credentials}){
 const active=db.prepare("SELECT * FROM walmart_publication_feeds WHERE variant_id=? AND status NOT IN ('SUCCESS','ERROR') ORDER BY created_at DESC LIMIT 1").get(p.id);
 if(active)fail(409,'Walmart está procesando un envío anterior. Consulta su resultado antes de repetirlo');
 if(link)fail(409,'La actualización de una publicación de Walmart requiere revisar su ficha existente; este flujo crea productos nuevos');
 const body=buildWalmartFeed(p,d),h=await headers(credentials);
 const form=new FormData();form.append('file',new Blob([JSON.stringify(body)],{type:'application/json'}),'meibo-'+p.sku+'.json');
 if(!db.prepare("UPDATE publication_drafts SET status='sending',error='' WHERE variant_id=? AND platform='Walmart' AND status IN ('draft','error') AND updated_at=?").run(p.id,row.updated_at).changes)fail(409,'El envío ya comenzó');
 try{
  const r=await fetch(base+'/feeds?feedType=MP_ITEM_INTL',{method:'POST',headers:h,body:form,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!r.ok){const j=await r.json().catch(()=>({}));const message=String(j.errors?.error?.[0]?.description??j.error?.[0]?.description??'').slice(0,500);db.prepare("UPDATE publication_drafts SET status=?,error=? WHERE variant_id=? AND platform='Walmart'").run(r.status<500?'error':'uncertain','Walmart HTTP '+r.status+(message?': '+message:''),p.id);fail(400,'Walmart rechazó la carga: HTTP '+r.status+(message?'. '+message:''));}
  const j=await r.json();if(typeof j.feedId!=='string'||!j.feedId)throw Error('Walmart no devolvió el ID de carga');
  db.prepare('INSERT INTO walmart_publication_feeds(feed_id,variant_id,sku,created_at,request_json,initial_stock) VALUES (?,?,?,?,?,?)').run(j.feedId,p.id,p.sku,now(),JSON.stringify(body),d.stock);
  db.prepare("UPDATE publication_drafts SET status='submitted',remote_id=?,error='',updated_at=? WHERE variant_id=? AND platform='Walmart'").run(j.feedId,now(),p.id);
  return {http_status:r.status,message:'Carga recibida por Walmart; pendiente de validación del producto'};
 }catch(e){db.prepare("UPDATE publication_drafts SET status='uncertain',error='Verifica la carga en Walmart antes de repetirla' WHERE variant_id=? AND platform='Walmart' AND status='sending'").run(p.id);throw e;}
}
export async function checkWalmartFeed(db,id,credentials,record,p){
 const feed=db.prepare('SELECT * FROM walmart_publication_feeds WHERE variant_id=? ORDER BY created_at DESC LIMIT 1').get(id);
 if(!feed)fail(404,'No hay una carga de Walmart para consultar');
 const r=await fetch(base+'/feeds/'+encodeURIComponent(feed.feed_id)+'?includeDetails=true&limit=50',{headers:await headers(credentials),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!r.ok)fail(409,'No se pudo consultar Walmart: HTTP '+r.status);
 const j=await r.json(),rows=j.itemDetails?.itemIngestionStatus??[],entry=rows.find(x=>x.sku===feed.sku),success=entry?.ingestionStatus==='SUCCESS',error=j.feedStatus==='ERROR'||entry&&['DATA_ERROR','SYSTEM_ERROR','TIMEOUT_ERROR'].includes(entry.ingestionStatus);
 let message=success?'Producto procesado por Walmart. Revisa su disponibilidad en el canal.':error?'Walmart rechazó la ficha. Revisa los datos antes de volver a enviar.':'Walmart está procesando la ficha';
 const details=entry?.ingestionErrors?.ingestionError??j.ingestionErrors?.ingestionError??[];
 if(details.length)message+=': '+details.map(e=>e.description??e.message??e.code).filter(Boolean).join('; ').slice(0,1200);
 if(entry?.pendingStatusDescription)message+=': '+String(entry.pendingStatusDescription).slice(0,1000);
 if(success&&!db.prepare("SELECT 1 FROM channel_listings WHERE variant_id=? AND platform='Walmart'").get(id)){
  const sent=JSON.parse(feed.request_json).MPItem[0],o=sent.Orderable,remote=entry.itemid??entry.itemId??entry.wpid;
  if(!remote)fail(409,'Walmart procesó la ficha pero no devolvió su identificador; revisa en origen');
  record(db,p,'Walmart',null,{name:o.productName,price:o.price,stock:null,image_url:o.mainImageUrl},{data:{}},String(remote));
 }
 db.prepare('UPDATE walmart_publication_feeds SET status=?,message=?,checked_at=? WHERE feed_id=?').run(success?'SUCCESS':error?'ERROR':String(j.feedStatus??'INPROGRESS'),message,now(),feed.feed_id);
 db.prepare("UPDATE publication_drafts SET status=?,error=? WHERE variant_id=? AND platform='Walmart'").run(success?'received':error?'error':'submitted',success?'':message,id);
 return {status:success?'SUCCESS':error?'ERROR':'INPROGRESS',message};
}
export async function completeWalmartStock(db,id,credentials){
 const feed=db.prepare("SELECT * FROM walmart_publication_feeds WHERE variant_id=? AND status='SUCCESS' ORDER BY created_at DESC LIMIT 1").get(id);
 if(!feed||feed.stock_status==='applied'||feed.stock_status==='error')return;
 const h=await headers(credentials),endpoint=base+'/inventory?sku='+encodeURIComponent(feed.sku);
 const confirm=j=>j.sku===feed.sku&&j.quantity?.unit==='EACH'&&Number(j.quantity.amount)===feed.initial_stock;
 const applied=()=>{db.prepare("UPDATE walmart_publication_feeds SET stock_status='applied',stock_message='Stock inicial confirmado por Walmart' WHERE feed_id=?").run(feed.feed_id);db.prepare("UPDATE channel_listings SET published_stock=? WHERE platform='Walmart' AND variant_id=?").run(feed.initial_stock,id);};
 if(['sending','uncertain'].includes(feed.stock_status)){
  const r=await fetch(endpoint,{headers:h,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(r.ok&&confirm(await r.json()))applied();
  else db.prepare("UPDATE walmart_publication_feeds SET stock_status='uncertain',stock_message='No se confirmó el stock inicial; requiere revisión antes de reenviar' WHERE feed_id=?").run(feed.feed_id);
  return;
 }
 if(!db.prepare("UPDATE walmart_publication_feeds SET stock_status='sending' WHERE feed_id=? AND stock_status='pending'").run(feed.feed_id).changes)return;
 try{
  const r=await fetch(endpoint,{method:'PUT',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({sku:feed.sku,quantity:{unit:'EACH',amount:feed.initial_stock}}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok){db.prepare('UPDATE walmart_publication_feeds SET stock_status=?,stock_message=? WHERE feed_id=?').run(r.status<500?'error':'uncertain','No se confirmó el stock inicial en Walmart: HTTP '+r.status,feed.feed_id);return;}
  if(!confirm(await r.json()))throw Error('Stock no confirmado');applied();
 }catch{db.prepare("UPDATE walmart_publication_feeds SET stock_status='uncertain',stock_message='Verificando el resultado del stock inicial; no se repetirá la escritura automáticamente' WHERE feed_id=?").run(feed.feed_id);}
}
export async function walmartConnectionStatus(credentials){await headers(credentials);return {connected:true,message:'Acceso a Walmart autorizado. La recepción de pedidos todavía no está activada.'};}
