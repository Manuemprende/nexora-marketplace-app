import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {fail, text} from './service.mjs';

const base='/api/integrations/mercadolibre';
const digest=value=>createHash('sha256').update(value).digest('hex');

export function configuration(env=process.env){
 const origin=env.NEXORA_PUBLIC_ORIGIN?.split(',')[0];
 if(!origin||!origin.startsWith('https://'))fail(503,'Configura el dominio HTTPS de Nexora');
 const key=Buffer.from(env.NEXORA_TOKEN_KEY||'','hex');
 return {clientId:env.MELI_CLIENT_ID,secret:env.MELI_CLIENT_SECRET,key,redirect:origin+base+'/callback',ready:!!env.MELI_CLIENT_ID&&!!env.MELI_CLIENT_SECRET&&key.length===32};
}

export function encryptTokens(value,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');
}

export function decryptTokens(value,key){
 const [iv,tag,data]=value.split('.').map(p=>Buffer.from(p,'base64url'));
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}

export function beginAuthorization(db,user,config=configuration()){
 if(!config.ready)fail(503,'Falta configurar Client ID y Client Secret de Mercado Libre en el servidor');
 if(user?.role!=='admin')fail(403,'Solo el administrador conecta Mercado Libre');
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
 db.prepare('DELETE FROM mercadolibre_oauth_states WHERE expires_at<?').run(Date.now());
 db.prepare('INSERT INTO mercadolibre_oauth_states VALUES (?,?,?,?)').run(digest(state),user.id,verifier,Date.now()+600000);
 const url=new URL('https://auth.mercadolibre.cl/authorization');
 url.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.redirect,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 return url.toString();
}

async function request(url,options,fetcher){
 let response;try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});}catch{fail(502,'Mercado Libre no respondió. Inicia nuevamente la conexión');}
 if(!response.ok)fail(502,`Mercado Libre rechazó la conexión (${response.status}). Inicia nuevamente la autorización`);
 return response.json();
}

export async function finishAuthorization(db,user,params,config=configuration(),fetcher=fetch){
 if(!config.ready)fail(503,'La aplicación aún no está configurada en Nexora');
 if(user?.role!=='admin')fail(401,'Inicia sesión en Nexora como administrador antes de autorizar');
 const state=params.get('state'),code=params.get('code');
 if(!state||state.length>200)fail(400,'Estado de autorización inválido');
 const row=db.prepare('SELECT * FROM mercadolibre_oauth_states WHERE state_hash=?').get(digest(state));
 if(!row||row.actor_id!==user.id||row.expires_at<Date.now())fail(400,'Autorización vencida o inválida. Inicia de nuevo desde Nexora');
 db.prepare('DELETE FROM mercadolibre_oauth_states WHERE state_hash=?').run(digest(state));
 if(params.has('error'))fail(400,'No se autorizó el acceso a Mercado Libre');
 if(!code||code.length>2000)fail(400,'Código de autorización inválido');
 const tokens=await request('https://api.mercadolibre.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.secret,code,redirect_uri:config.redirect,code_verifier:row.verifier}).toString()},fetcher);
 if(!tokens.access_token||!tokens.refresh_token||!Number.isFinite(tokens.expires_in)||!tokens.user_id)fail(502,'Respuesta de autorización incompleta');
 const profile=await request('https://api.mercadolibre.com/users/me',{headers:{Authorization:`Bearer ${tokens.access_token}`}},fetcher);
 if(String(profile.id)!==String(tokens.user_id)||profile.site_id!=='MLC')fail(400,'Esta conexión requiere una cuenta de Mercado Libre Chile');
 db.prepare(`INSERT INTO mercadolibre_connections VALUES (?,?,?,?,?,?,?) ON CONFLICT(seller_id) DO UPDATE SET nickname=excluded.nickname,site_id=excluded.site_id,tokens_encrypted=excluded.tokens_encrypted,expires_at=excluded.expires_at,actor_id=excluded.actor_id,updated_at=excluded.updated_at`).run(String(profile.id),profile.nickname||'',profile.site_id,encryptTokens(tokens,config.key),Date.now()+tokens.expires_in*1000,user.id,new Date().toISOString());
 return {sellerId:String(profile.id),nickname:profile.nickname};
}

export async function getValidMeliToken(db, sellerId = null, config = configuration(), fetcher = fetch) {
 const row = (sellerId ? db.prepare('SELECT * FROM mercadolibre_connections WHERE seller_id=?').get(String(sellerId)) : null)
   || db.prepare('SELECT * FROM mercadolibre_connections ORDER BY updated_at DESC LIMIT 1').get();
 if (!row) fail(400, 'Mercado Libre no está conectado en esta plataforma');

 const tokens = decryptTokens(row.tokens_encrypted, config.key);
 // Si faltan menos de 5 minutos (300.000 ms) para expirar, refrescar automáticamente
 if ((row.expires_at - Date.now()) < 300000) {
   const refreshParams = new URLSearchParams({
     grant_type: 'refresh_token',
     client_id: config.clientId,
     client_secret: config.secret,
     refresh_token: tokens.refresh_token
   });
   let res;
   try {
     res = await fetcher('https://api.mercadolibre.com/oauth/token', {
       method: 'POST',
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       body: refreshParams.toString()
     });
   } catch {
     fail(502, 'Fallo de conexión al refrescar token de Mercado Libre');
   }
   if (!res.ok) {
     const err = await res.text();
     fail(502, `Error renovando sesión de Mercado Libre: ${err}`);
   }
   const newTokens = await res.json();
   const newExpiresAt = Date.now() + newTokens.expires_in * 1000;
   db.prepare(`UPDATE mercadolibre_connections SET tokens_encrypted=?, expires_at=?, updated_at=? WHERE seller_id=?`)
     .run(encryptTokens(newTokens, config.key), newExpiresAt, new Date().toISOString(), row.seller_id);
   return { token: newTokens.access_token, sellerId: row.seller_id };
 }
 return { token: tokens.access_token, sellerId: row.seller_id };
}

export async function predictMeliCategory(searchQuery, fetcher = fetch) {
 const q = encodeURIComponent(searchQuery.trim());
 const res = await fetcher(`https://api.mercadolibre.com/sites/MLC/domain_discovery/search?q=${q}`);
 if (!res.ok) return [];
 const data = await res.json();
 return Array.isArray(data) ? data : [];
}

export async function publishMeliItem(db, itemData, config = configuration(), fetcher = fetch) {
 const { token, sellerId } = await getValidMeliToken(db, itemData.sellerId, config, fetcher);

 const cleanTitle = String(itemData.title || '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim().slice(0, 60);

 const payload = {
   family_name: cleanTitle,
   site_id: 'MLC',
   category_id: itemData.categoryId,
   price: Math.round(Number(itemData.price)),
   currency_id: 'CLP',
   available_quantity: Number(itemData.stock || 20),
   buying_mode: 'buy_it_now',
   listing_type_id: itemData.listingTypeId || 'gold_special',
   condition: 'new',
   pictures: (itemData.images && itemData.images.length)
     ? itemData.images.map(url => ({ source: url }))
     : [{ source: itemData.image }],
   attributes: [
     { id: 'BRAND', value_name: itemData.brand || 'Genérico' },
     { id: 'MODEL', value_name: itemData.model || 'Estándar' },
     { id: 'ITEM_CONDITION', value_name: 'Nuevo' },
     ...(itemData.attributes || [])
   ]
 };

 let res;
 try {
   res = await fetcher('https://api.mercadolibre.com/items', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify(payload)
   });
 } catch (err) {
   return { ok: false, error: `Error de red con Mercado Libre: ${err.message}` };
 }

 const resData = await res.json();
 if (!res.ok) {
   return {
     ok: false,
     status: res.status,
     error: resData.message || resData.error || 'Mercado Libre rechazó la publicación',
     details: resData
   };
 }

 if (itemData.description) {
   try {
     await fetcher(`https://api.mercadolibre.com/items/${resData.id}/description`, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({ plain_text: String(itemData.description).slice(0, 4500) })
     });
   } catch {}
 }

 if (itemData.variantId) {
   try {
     db.prepare(`
       INSERT INTO external_codes (id, variant_id, platform, code, origin, created_at)
       VALUES (?, ?, 'Mercado Libre', ?, 'Publicación directa', ?)
     `).run(randomBytes(16).toString('hex'), itemData.variantId, resData.id, new Date().toISOString());
   } catch {}
 }

 return {
   ok: true,
   id: resData.id,
   permalink: resData.permalink,
   title: resData.title,
   price: resData.price,
   status: resData.status
 };
}

export async function mercadolibreRoutes({db,user,url,req,res,token,readBody,secureCookie=''}){
 if(!url.pathname.startsWith(base))return false;

 const send = (status, data) => {
   res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
   res.end(JSON.stringify(data));
 };

 if(user?.role!=='admin')fail(403,'Inicia sesión como administrador para conectar Mercado Libre');
 const config=configuration();

 if(url.pathname===base+'/status' && req.method==='GET'){
  send(200, {
    configured:config.ready,
    connections:db.prepare('SELECT seller_id,nickname,site_id,expires_at,updated_at FROM mercadolibre_connections').all()
  });
  return true;
 }

 if(url.pathname===base+'/connect' && req.method==='GET'){
  const location=beginAuthorization(db,user,config);
  res.setHeader('Set-Cookie',`nexora_oauth_session=${token}; HttpOnly; SameSite=Lax; Path=${base}/callback; Max-Age=600${secureCookie}`);
  res.writeHead(302,{Location:location});res.end();return true;
 }

 if(url.pathname===base+'/callback' && req.method==='GET'){
  res.setHeader('Set-Cookie',`nexora_oauth_session=; HttpOnly; SameSite=Lax; Path=${base}/callback; Max-Age=0${secureCookie}`);
  await finishAuthorization(db,user,url.searchParams,config);
  res.writeHead(303,{Location:'/#integrations'});res.end();return true;
 }

 if(url.pathname===base+'/predict-category' && req.method==='POST'){
   const input = await readBody(req);
   const q = text(input.query || input.title || '', 'Búsqueda', 200, true);
   const categories = await predictMeliCategory(q);
   send(200, { ok: true, categories });
   return true;
 }

 if(url.pathname===base+'/publish' && req.method==='POST'){
   const input = await readBody(req);
   const result = await publishMeliItem(db, input, config);
   send(result.ok ? 201 : 400, result);
   return true;
 }

 fail(404,'Ruta de integración no encontrada');
}
