import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fail} from './service.mjs';
import {now} from './database.mjs';
const resource='https://mcp.dropi.co/mcp',authorizeUrl='https://oauth.dropi.co/oauth/authorize',issuer='https://integrations.dropi.co';
export const dropiHash=value=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const defaultDataDir=dirname(process.env.NEXORA_DB_PATH||process.env.MEIBO_DB_PATH||'/var/lib/nexora/nexora.sqlite');
const path=()=>process.env.MEIBO_DROPI_OAUTH_PATH??resolve(defaultDataDir,'dropi-mcp-oauth.json');
async function key(){
 const file=path()+'.key';await mkdir(dirname(file),{recursive:true});
 try{return await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
 try{await writeFile(file,randomBytes(32),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 return readFile(file);
}
async function encrypt(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await key(),iv),content=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),content:content.toString('base64')};}
async function decrypt(value){const decipher=createDecipheriv('aes-256-gcm',await key(),Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.content,'base64')),decipher.final()]).toString('utf8'));}
async function load(){try{return await decrypt(JSON.parse(await readFile(path(),'utf8')));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
async function save(value){const file=path(),temp=file+'.'+randomBytes(6).toString('hex')+'.next';await mkdir(dirname(file),{recursive:true});await writeFile(temp,JSON.stringify(await encrypt(value)),{mode:0o600});await rename(temp,file);}
async function jsonRequest(url,options){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)fail(409,'Dropi no pudo completar la autorización: HTTP '+r.status);return r.json();}
async function publicBase(reqOrigin){
 const candidates=[reqOrigin,process.env.MEIBO_PUBLIC_URL,process.env.NEXORA_PUBLIC_URL,process.env.NEXORA_PUBLIC_ORIGIN?.split(',')[0],'https://market.wentixai.digital'].filter(Boolean);
 for(const raw of candidates){
  try{const u=new URL(raw);if(u.protocol==='https:')return u.origin;}catch{}
 }
 try{
  const c=JSON.parse(await readFile(process.env.MEIBO_PUBLISH_CREDENTIALS??'/data/publishing-credentials.json','utf8'));
  const u=new URL(c.public_base_url);
  if(u.protocol==='https:')return u.origin;
 }catch{}
 return 'https://market.wentixai.digital';
}
let registration;
async function client(redirect){
 const stored=await load();if(stored.client_id&&stored.redirect_uri===redirect)return stored;
 if(registration)return registration;
 registration=(async()=>{const j=await jsonRequest(issuer+'/oauth/register',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({client_name:'NEXORA',client_uri:new URL(redirect).origin,redirect_uris:[redirect],response_types:['code'],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'none'})});if(typeof j.client_id!=='string'||!j.client_id)fail(502,'Dropi no devolvió el identificador de la conexión');const c={client_id:j.client_id,redirect_uri:redirect,connection_id:random()};await save(c);return c;})();
 try{return await registration;}finally{registration=null;}
}
export async function startDropiOAuth(db,user,sessionHash,reqOrigin){
 const redirect=(await publicBase(reqOrigin))+'/api/integrations/dropi/callback',c=await client(redirect),state=random(),verifier=random(),browser=random(),time=Date.now();
 db.prepare('DELETE FROM dropi_oauth_attempts WHERE expires_at<?').run(time-86400000);
 db.prepare('INSERT INTO dropi_oauth_attempts(state_hash,user_id,session_hash,browser_hash,verifier,redirect_uri,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)').run(dropiHash(state),user.id,sessionHash,dropiHash(browser),JSON.stringify(await encrypt(verifier)),redirect,time+10*60000,now());
 const url=new URL(authorizeUrl);for(const [k,v] of Object.entries({response_type:'code',client_id:c.client_id,redirect_uri:redirect,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',scope:'mcp',resource}))url.searchParams.set(k,v);
 return {url:url.href,browser};
}
async function tokenExchange(body){return jsonRequest(issuer+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({...body,resource}).toString()});}
function tokens(j,old={}){if(typeof j.access_token!=='string'||!j.access_token||j.token_type&&j.token_type.toLowerCase()!=='bearer')fail(502,'Dropi no devolvió una autorización válida');return {access_token:j.access_token,refresh_token:j.refresh_token||old.refresh_token||'',expires_at:Date.now()+(Number(j.expires_in)>0?Number(j.expires_in):300)*1000,scope:j.scope??'mcp',needs_reconnect:false};}
async function rpc(token,body,session,protocol){
 const r=await fetch(resource,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session}:{}),...(protocol?{'MCP-Protocol-Version':protocol}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!r.ok)fail(409,'No se pudo verificar la conexión MCP de Dropi: HTTP '+r.status);
 const raw=await r.text();if(raw.length>2000000)fail(502,'Respuesta MCP demasiado grande');
 const data=raw.trim()?(r.headers.get('content-type')?.includes('text/event-stream')?raw.split('\n').filter(x=>x.startsWith('data:')).map(x=>JSON.parse(x.slice(5))).findLast(x=>x.id===body.id):JSON.parse(raw)):null;
 if(data?.error)fail(409,'Dropi no pudo verificar las herramientas de la conexión');return {data,session:r.headers.get('mcp-session-id')??session};
}
export async function dropiReadOrderSession(){
 let session,protocol,sessionToken,id=1,resetting;
 async function reset(token){if(resetting)return resetting;resetting=(async()=>{const init=await rpc(token,{jsonrpc:'2.0',id:id++,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'MEIBO',version:'1.0'}}});const next=init.session,nextProtocol=init.data?.result?.protocolVersion??'2025-03-26';await rpc(token,{jsonrpc:'2.0',method:'notifications/initialized'},next,nextProtocol);session=next;protocol=nextProtocol;sessionToken=token;})();try{return await resetting;}finally{resetting=null;}}
 await reset(await dropiAccessToken());
 async function perform(token,body){if(token!==sessionToken)await reset(token);const current=session,r=await rpc(token,body,current,protocol);if(session===current)session=r.session;return r;}
 async function call(name,args){const body={jsonrpc:'2.0',id:id++,method:'tools/call',params:{name,arguments:args}};let token=await dropiAccessToken(),r;
  try{r=await perform(token,body);}catch(e){if(!/HTTP 401/.test(e.message))throw e;const latest=await dropiAccessToken();token=latest===token?await dropiAccessToken({force:true}):latest;await reset(token);r=await perform(token,body);}
  if(r.data?.result?.isError&&!/\b404\b/.test(JSON.stringify(r.data.result.content??[]))){await new Promise(resolve=>setTimeout(resolve,1200));token=await dropiAccessToken();await reset(token);r=await perform(token,{...body,id:id++});}
  return r.data?.result;
 }
 const read=async orderId=>{if(!/^\d+$/.test(String(orderId)))fail(400,'Pedido Dropi inválido');return call('get_order',{id:String(orderId)});};read.list=args=>call('list_orders',args);read.call=call;return read;
}
let sharedMcpSession;
export async function callDropiMcpTool(name,args={}){
 if(!sharedMcpSession)sharedMcpSession=dropiReadOrderSession().catch(e=>{sharedMcpSession=null;throw e;});
 const session=await sharedMcpSession;
 return session.call(name,args);
}
function parseCsvRow(line){
 const out=[];let value='',quoted=false;
 for(let n=0;n<line.length;n++){const c=line[n];if(c==='"'){if(quoted&&line[n+1]==='"'){value+='"';n++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(value.trim());value='';}else value+=c;}
 out.push(value.trim());return out;
}
function parseMcpTable(result,tableName){
 const text=(result?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
 const lines=text.split(/\r?\n/);
 const at=lines.findIndex(l=>l.startsWith(tableName+'['));
 if(at<0)return {rows:[],text};
 const header=lines[at]?.match(/^[a-z_]+\[(\d+)\]\{([^}]+)\}:$/);
 if(!header)return {rows:[],text};
 const count=Number(header[1]),keys=header[2].split(',');
 const rows=lines.slice(at+1,at+1+count).filter(l=>l.trim()).map(l=>{
  const vals=parseCsvRow(l.trim());
  return Object.fromEntries(keys.map((k,i)=>[k,vals[i]??'']));
 });
 return {rows,text};
}
let cachedDepartments=null;
export async function resolveDropiChileLocation(communeRaw='Santiago',regionRaw='Región Metropolitana'){
 const cleanCommune=String(communeRaw||'Santiago').trim().replace(/^comuna\s+de\s+/i,'');
 if(!cachedDepartments){
  try{
   const deptRes=await callDropiMcpTool('list_departments',{});
   const {rows}=parseMcpTable(deptRes,'items');
   if(rows.length)cachedDepartments=rows;
  }catch{}
 }
 const depts=cachedDepartments||[];
 let cityRow=null;
 try{
  const cityRes=await callDropiMcpTool('search_cities',{name:cleanCommune});
  const {rows}=parseMcpTable(cityRes,'items');
  if(rows.length){
   const exact=rows.find(r=>String(r.name||'').toLowerCase()===cleanCommune.toLowerCase());
   cityRow=exact||rows[0];
  }
 }catch{}
 if(!cityRow&&cleanCommune.toLowerCase()!=='santiago'){
  try{
   const fallbackRes=await callDropiMcpTool('search_cities',{name:'Santiago'});
   const {rows}=parseMcpTable(fallbackRes,'items');
   cityRow=rows[0]||null;
  }catch{}
 }
 const dept=depts.find(d=>String(d.id)===String(cityRow?.department_id))||depts.find(d=>String(d.name||'').toLowerCase().includes('metropolitana'))||{id:'8',name:'METROPOLITANA DE SANTIAGO',department_code:'13'};
 return {
  city_id:Number(cityRow?.id||1),
  city_name:cityRow?.name||cleanCommune.toUpperCase()||'SANTIAGO',
  dane_code:cityRow?.cod_dane||'1',
  zip_code:cityRow?.zip_code||'SCL',
  department_id:Number(dept.id||8),
  state:dept.department_code||dept.name||'13',
  state_name:dept.name||'METROPOLITANA DE SANTIAGO'
 };
}
export async function quoteDropiShippingViaMcp({commune='Santiago',region='Región Metropolitana',productId,variationId=null,quantity=1,price=24990,cashOnDelivery=true,getProductDetail=null}={}){
 const numProductId=Number(String(productId||'').replace(/\D+/g,''));
 if(!numProductId)fail(400,'Se requiere el ID de producto de Dropi para cotizar envío');
 const loc=await resolveDropiChileLocation(commune,region);
 let resolvedVariationId=variationId?Number(variationId):null;
 let prodType=resolvedVariationId?'VARIABLE':'SIMPLE';
 if(!resolvedVariationId&&typeof getProductDetail==='function'){
  try{
   const detail=await getProductDetail(numProductId);
   const vars=Array.isArray(detail?.variations)?detail.variations:[];
   if(vars.length>0){
    prodType='VARIABLE';
    const withStock=vars.find(v=>Number(v.stock||0)>0)||vars[0];
    resolvedVariationId=Number(withStock.id);
   }
  }catch{}
 }
 const prodItem={id:numProductId,type:prodType,quantity:Math.max(1,Number(quantity)||1),price:Math.max(1, Math.round(Number(price)||24990))};
 if(resolvedVariationId)prodItem.variation_id=resolvedVariationId;
 const destCity={id:loc.city_id,zip_code:loc.zip_code||'SCL'};
 if(loc.dane_code)destCity.dane_code=String(loc.dane_code);
 const res=await callDropiMcpTool('quote_shipping',{cash_on_delivery:Boolean(cashOnDelivery),destination_city:destCity,products:[prodItem]});
 const {rows,text}=parseMcpTable(res,'carriers');
 return {
  ok:!res?.isError,
  location:loc,
  product:prodItem,
  carriers:rows.map(r=>({
   carrier:r.carrier,
   service:r.service,
   shipping_cost:r.shipping_cost&&r.shipping_cost!=='null'?Number(r.shipping_cost):null,
   error:r.error&&r.error!=='null'?r.error:null
  })),
  raw_text:text
 };
}
export async function createDropiOrderViaMcp(orderInput={},{getProductDetail=null}={}){
 const rawProdId=String(orderInput.supplier_product_id||orderInput.product_id||'').replace(/\D+/g,'');
 const numProductId=Number(rawProdId);
 if(!numProductId)fail(400,'El pedido no tiene un ID de producto de Dropi Chile asignado. Configúralo en el Mapeo de la Landing o al editar el pedido.');
 const fullName=String(orderInput.customer_name||'Cliente Landing').trim();
 const nameParts=fullName.split(/\s+/).filter(Boolean);
 const firstName=nameParts[0]||'Cliente';
 const lastName=nameParts.slice(1).join(' ')||'Apellido';
 const address=String(orderInput.customer_address||'').trim();
 if(!address)fail(400,'El pedido requiere dirección de entrega para crear la orden en Dropi');
 const rawPhone=String(orderInput.customer_phone||'').replace(/\D+/g,'');
 if(rawPhone.length<7)fail(400,'El pedido requiere un teléfono válido para crear la orden en Dropi');
 const packStr=String(orderInput.pack_selected||'1 Unidad');
 const packMatch=packStr.match(/(\d+)\s*(?:unid|pack|x\b)/i)||packStr.match(/^(\d+)x/i);
 const quantity=Math.max(1,Number(orderInput.quantity||(packMatch?packMatch[1]:1))||1);
 const totalOrderPrice=Math.max(1,Math.round(Number(orderInput.total_price||24990)));
 const unitPrice=Math.max(1,Math.round(totalOrderPrice/quantity));
 const loc=await resolveDropiChileLocation(orderInput.customer_commune||'Santiago',orderInput.customer_region||'Región Metropolitana');
 let variationId=orderInput.variation_id?Number(orderInput.variation_id):null;
 if(!variationId&&typeof getProductDetail==='function'){
  try{
   const detail=await getProductDetail(numProductId);
   const vars=Array.isArray(detail?.variations)?detail.variations:[];
   if(vars.length>0){
    const preferred=vars.find(v=>{
     const attrStr=JSON.stringify(v.attributes||v.attribute_values||v.sku||'').toLowerCase();
     return packStr.toLowerCase().includes(attrStr)&&attrStr.length>2;
    })||vars.find(v=>Number(v.stock||0)>=quantity)||vars.find(v=>Number(v.stock||0)>0)||vars[0];
    if(preferred?.id)variationId=Number(preferred.id);
   }
  }catch{}
 }
 const productPayload={id:numProductId,price:unitPrice,quantity};
 if(variationId)productPayload.variation_id=variationId;
 const mcpArgs={
  name:firstName,
  surname:lastName,
  dir:address,
  state:String(loc.state),
  city:String(loc.city_name),
  phone:rawPhone,
  rate_type:orderInput.rate_type||'CON RECAUDO',
  shop_order_id:String(orderInput.id||orderInput.order_id||''),
  shop_order_number:String(orderInput.order_number||''),
  notes:`Pedido Nexora #${orderInput.order_number||''} (${packStr})`.trim(),
  products:[productPayload]
 };
 if(orderInput.distribution_company_id)mcpArgs.distribution_company_id=Number(orderInput.distribution_company_id);
 const res=await callDropiMcpTool('create_order',mcpArgs);
 const text=(res?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();
 if(res?.isError){
  fail(409,`Dropi MCP rechazó la creación del pedido: ${text||'Error desconocido en Dropi'}`);
 }
 const scalar=key=>{
  const line=text.split(/\r?\n/).find(l=>new RegExp('^\\s*'+key+':\\s*','i').test(l));
  if(!line)return '';
  return line.replace(new RegExp('^\\s*'+key+':\\s*','i'),'').trim().replace(/^"|"$/g,'');
 };
 const createdOrderId=scalar('order_id')||scalar('id')||(text.match(/\b(\d{6,12})\b/)?.[1]??'');
 const status=scalar('status')||'PENDIENTE';
 const trackingCode=scalar('tracking_code')||scalar('shipping_guide')||'';
 const shippingCompany=scalar('shipping_company')||scalar('carrier')||'';
 return {
  ok:true,
  dropi_order_id:createdOrderId,
  status,
  tracking_code:trackingCode,
  shipping_company:shippingCompany,
  location:loc,
  product:productPayload,
  raw_text:text
 };
}

export async function listDropiTools(accessToken){
 const init=await rpc(accessToken,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'MEIBO',version:'1.0'}}});if(!init.data?.result)fail(502,'Dropi no confirmó la conexión MCP');
 const protocol=init.data.result.protocolVersion??'2025-03-26';
 await rpc(accessToken,{jsonrpc:'2.0',method:'notifications/initialized'},init.session,protocol);
 const names=[];let cursor;
 for(let page=0;page<10;page++){
  const row=await rpc(accessToken,{jsonrpc:'2.0',id:page+2,method:'tools/list',params:cursor?{cursor}:{}},init.session,protocol),result=row.data?.result;
  if(!Array.isArray(result?.tools))fail(502,'Dropi no devolvió su lista de herramientas');names.push(...result.tools.filter(t=>typeof t.name==='string').map(t=>t.name));cursor=result.nextCursor;if(!cursor)return [...new Set(names)];
 }
 fail(502,'Dropi devolvió demasiadas páginas de herramientas');
}
export async function finishDropiOAuth(db,params,browser){
 const state=params.get('state')??'',row=db.prepare('SELECT * FROM dropi_oauth_attempts WHERE state_hash=?').get(dropiHash(state));
 if(!row||!browser||row.browser_hash!==dropiHash(browser)||row.consumed_at||row.expires_at<Date.now())fail(400,'La autorización venció o no corresponde a este navegador. Inicia la conexión desde Configuración.');
 const session=db.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND u.active=1 AND u.role='admin'").get(row.session_hash,row.user_id,Date.now());if(!session)fail(403,'Tu sesión de MEIBO venció. Ingresa nuevamente antes de conectar Dropi.');
 if(!db.prepare("UPDATE dropi_oauth_attempts SET consumed_at=?,result='processing' WHERE state_hash=? AND consumed_at IS NULL").run(now(),row.state_hash).changes)fail(400,'Esta autorización ya fue utilizada');
 if(params.has('error')){db.prepare("UPDATE dropi_oauth_attempts SET result='cancelled' WHERE state_hash=?").run(row.state_hash);return;}
 try{
  const code=params.get('code');if(!code||code.length>4096)fail(400,'Dropi no devolvió el código de autorización');
  const c=await load(),j=await tokenExchange({grant_type:'authorization_code',code,code_verifier:await decrypt(JSON.parse(row.verifier)),redirect_uri:row.redirect_uri,client_id:c.client_id}),connection={...c,...tokens(j),connected_at:now(),connected_by:row.user_id,connection_id:random(),verified:false,last_error:''};
  if(db.prepare('SELECT result FROM dropi_oauth_attempts WHERE state_hash=?').get(row.state_hash)?.result!=='processing')fail(409,'La conexión fue cancelada');
  await save(connection);
  try{connection.tools=await listDropiTools(connection.access_token);connection.verified=true;connection.verified_at=now();if((await load()).connection_id===connection.connection_id)await save(connection);}catch{connection.last_error='Autorización guardada. Falta verificar la conexión con Dropi.';if((await load()).connection_id===connection.connection_id)await save(connection);}
  db.prepare("UPDATE dropi_oauth_attempts SET result=? WHERE state_hash=?").run(connection.verified?'connected':'saved',row.state_hash);
 }catch(e){db.prepare("UPDATE dropi_oauth_attempts SET result='error' WHERE state_hash=?").run(row.state_hash);throw e;}
}
let refreshing;
export async function dropiAccessToken({force=false}={}){
 const c=await load();if(!c.access_token||c.needs_reconnect)fail(409,'Conecta la cuenta de Dropi desde Configuración');if(!force&&c.expires_at>Date.now()+60000)return c.access_token;
 if(refreshing)return refreshing;
 refreshing=(async()=>{if(!c.refresh_token)fail(409,'Dropi requiere una nueva autorización');try{const j=await tokenExchange({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:c.client_id}),next={...c,...tokens(j,c)};if((await load()).connection_id!==c.connection_id)fail(409,'La conexión cambió durante la verificación');await save(next);return next.access_token;}catch(e){if(e.status===409&&(await load()).connection_id===c.connection_id){await save({...c,needs_reconnect:true,last_error:'Dropi requiere volver a autorizar la cuenta'});}throw e;}})();
 try{return await refreshing;}finally{refreshing=null;}
}
export async function checkDropiOAuth(){sharedMcpSession=null;const token=await dropiAccessToken(),tools=await listDropiTools(token),c=await load();if(c.access_token!==token)fail(409,'La conexión cambió durante la verificación');await save({...c,tools,verified:true,verified_at:now(),last_error:''});}
export async function dropiOAuthStatus(db){const c=await load(),last=db.prepare('SELECT created_at,result,expires_at FROM dropi_oauth_attempts ORDER BY created_at DESC LIMIT 1').get();return {connected:!!c.access_token&&!!c.verified&&!c.needs_reconnect&&(c.expires_at>Date.now()||!!c.refresh_token),authorization_saved:!!c.access_token,needs_reconnect:!!c.needs_reconnect||!!c.access_token&&c.expires_at<Date.now()&&!c.refresh_token,connected_at:c.connected_at??null,verified_at:c.verified_at??null,expires_at:c.expires_at?new Date(c.expires_at).toISOString():null,renewable:!!c.refresh_token,tools_count:c.tools?.length??0,tools:c.tools??[],message:c.last_error??'',last_attempt:last?{created_at:last.created_at,result:last.result==='pending'&&last.expires_at<Date.now()?'expired':last.result}:null};}
export async function disconnectDropiOAuth(db){sharedMcpSession=null;const c=await load();db.prepare("UPDATE dropi_oauth_attempts SET result='cancelled',consumed_at=COALESCE(consumed_at,?) WHERE result IN ('pending','processing')").run(now());const cleared={client_id:c.client_id,redirect_uri:c.redirect_uri,connection_id:random()};await save(cleared);let revoked=true;if(c.access_token){try{const r=await fetch(issuer+'/oauth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:c.refresh_token||c.access_token,client_id:c.client_id}).toString(),redirect:'error',signal:AbortSignal.timeout(20000)});revoked=r.ok;}catch{revoked=false;}}if((await load()).connection_id===cleared.connection_id)await save({...cleared,last_error:revoked?'':'Conexión retirada de MEIBO. No se pudo confirmar la revocación en Dropi.'});}
