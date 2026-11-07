import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {uuid,now,transaction} from './database.mjs';
import {fail,text,operation} from './service.mjs';
import {receiptPdf} from './receipt-pdf.mjs';
import {whatsappPhone} from './phone.mjs';
export {whatsappPhone} from './phone.mjs';
export function receiptCustomerPhone(db,sale){return sale.customer_phone|| (sale.customer_id?db.prepare('SELECT phone FROM customers WHERE id=?').get(sale.customer_id)?.phone:'')||'';}
export function saleForWhatsapp(db,id){const sale=db.prepare('SELECT * FROM sales WHERE id=?').get(id);if(!sale)fail(404,'Venta no encontrada');return {...sale,items:db.prepare('SELECT * FROM sale_items WHERE sale_id=? ORDER BY rowid').all(id)};}
export async function whatsappAuth(db,{keyPath=process.env.MEIBO_WHATSAPP_KEY??'/data/whatsapp-auth.key',module}={}){
 await mkdir(dirname(keyPath),{recursive:true});let key;try{key=await readFile(keyPath);}catch(e){if(e.code!=='ENOENT')throw e;try{await writeFile(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});}catch(x){if(x.code!=='EEXIST')throw x;}key=await readFile(keyPath);}if(key.length!==32)throw Error('Invalid WhatsApp storage key');
 const encode=value=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(JSON.stringify(value,module.BufferJSON.replacer)),c.final()]);return JSON.stringify({iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')});};
 const decode=value=>{const j=JSON.parse(value),c=createDecipheriv('aes-256-gcm',key,Buffer.from(j.iv,'base64'));c.setAuthTag(Buffer.from(j.tag,'base64'));return JSON.parse(Buffer.concat([c.update(Buffer.from(j.data,'base64')),c.final()]).toString(),module.BufferJSON.reviver);};
 const get=name=>{const row=db.prepare('SELECT value FROM whatsapp_auth WHERE name=?').get(name);return row?decode(row.value):null;},set=(name,value)=>{if(value==null)db.prepare('DELETE FROM whatsapp_auth WHERE name=?').run(name);else db.prepare('INSERT INTO whatsapp_auth VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name,encode(value));};
 const creds=get('creds')??module.initAuthCreds();return {state:{creds,keys:{get:async(type,ids)=>{const out={};for(const id of ids){let value=get(type+':'+id);if(value&&type==='app-state-sync-key')value=module.proto.Message.AppStateSyncKeyData.fromObject(value);if(value)out[id]=value;}return out;},set:async data=>transaction(db,()=>{for(const [type,items] of Object.entries(data))for(const [id,value] of Object.entries(items))set(type+':'+id,value);})}},saveCreds:()=>set('creds',creds)};
}
export function whatsappMessages(db,saleId){return db.prepare('SELECT id,phone,status,error,created_at,updated_at FROM whatsapp_outbox WHERE sale_id=? ORDER BY created_at DESC LIMIT 20').all(saleId);}
export async function queueWhatsappReceipt(db,saleId,input,actor,{makePdf=receiptPdf}={}){
 const sale=saleForWhatsapp(db,saleId),phone=whatsappPhone(input.phone??receiptCustomerPhone(db,sale));if(input.customer_requested!==true)fail(400,'Confirma que el cliente solicitó recibir el comprobante');const connection=db.prepare('SELECT * FROM whatsapp_connection WHERE id=1').get();if(!connection?.enabled||!connection.sender_jid)fail(409,'Conecta WhatsApp en Configuración antes de enviar comprobantes');
 const hash=createHash('sha256').update(JSON.stringify(sale)).digest('hex'),document=await makePdf(sale);
 return operation(db,actor,input.request_id,{kind:'whatsapp-receipt',saleId,phone,hash},()=>{const old=db.prepare('SELECT id,status FROM whatsapp_outbox WHERE sale_id=? AND phone=? AND document_hash=?').get(saleId,phone,hash);if(old){if(['failed','cancelled'].includes(old.status)){db.prepare("UPDATE whatsapp_outbox SET status='queued',sender_jid=?,remote_id=NULL,error='',updated_at=? WHERE id=?").run(connection.sender_jid,now(),old.id);return {id:old.id,status:'queued',retry:true};}return {...old,existing:true};}const id=uuid(),stamp=now();db.prepare("INSERT INTO whatsapp_outbox(id,sale_id,phone,sender_jid,document_hash,document,status,actor_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'queued',?,?,?)").run(id,saleId,phone,connection.sender_jid,hash,document,actor,stamp,stamp);return {id,status:'queued'};});
}
export async function processWhatsappQueue(db,{sender,send,connected}){
 if(!connected)return;const rows=db.prepare("SELECT * FROM whatsapp_outbox WHERE status='queued' ORDER BY created_at LIMIT 5").all();
 for(const row of rows){if(row.sender_jid!==sender){db.prepare("UPDATE whatsapp_outbox SET status='failed',error='El número de WhatsApp conectado cambió. Revisa el destinatario y el remitente.',updated_at=? WHERE id=?").run(now(),row.id);continue;}
 if(!db.prepare("UPDATE whatsapp_outbox SET status='sending',remote_id=?,updated_at=? WHERE id=? AND status='queued'").run(randomBytes(10).toString('hex').toUpperCase(),now(),row.id).changes)continue;
 const current=db.prepare('SELECT remote_id FROM whatsapp_outbox WHERE id=?').get(row.id);
 try{await send(row.phone,Buffer.from(row.document),row.sale_id,current.remote_id);db.prepare("UPDATE whatsapp_outbox SET status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'sent' END,error='',updated_at=? WHERE id=?").run(now(),row.id);}
 catch{db.prepare("UPDATE whatsapp_outbox SET status=CASE WHEN status IN ('sent','delivered','read') THEN status ELSE 'uncertain' END,error=CASE WHEN status IN ('sent','delivered','read') THEN '' ELSE 'No se confirmó el envío. Revisa WhatsApp antes de repetirlo.' END,updated_at=? WHERE id=?").run(now(),row.id);}
 }
}
export function createWhatsappService(db,{modules=async()=>{const [baileys,qrcode,pino]=await Promise.all([import('@whiskeysockets/baileys'),import('qrcode'),import('pino')]);return {baileys,qrcode:qrcode.default,pino:pino.default};},keyPath,onIncomingMessage}={}){
 let sock=null,qr=null,qrAt=null,state='disconnected',loading=null,generation=0,timer=null,retries=0,draining=false,disposed=false;
 const config=()=>db.prepare('SELECT * FROM whatsapp_connection WHERE id=1').get();
 const cloudConfig=()=>({token:process.env.WHATSAPP_ACCESS_TOKEN||'',phoneId:process.env.WHATSAPP_PHONE_NUMBER_ID||'',wabaId:process.env.WHATSAPP_WABA_ID||'',verifyToken:process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||'',appSecret:process.env.WHATSAPP_APP_SECRET||''});
 const status=(includeQr=false)=>{const cc=cloudConfig(),hasCloud=Boolean(cc.token&&cc.phoneId);return {state:hasCloud&&state!=='connected'?'cloud_api':state,connected:state==='connected'||hasCloud,cloud_api_configured:hasCloud,phone:config().sender_jid?config().sender_jid.split('@')[0]:(hasCloud?cc.phoneId:''),connected_at:config().connected_at,message:config().last_error,...(includeQr?{qr:qr&&Date.now()-qrAt<60000?qr:null,qr_expires_at:qrAt?new Date(qrAt+60000).toISOString():null}:{})};};
 async function sendText(rawPhone,textBody){
  const clean=String(rawPhone||'').replace(/[^0-9]/g,'');
  const normPhone=clean.startsWith('56')?clean:`56${clean.replace(/^0+/,'')}`;
  if(normPhone.length<10)fail(400,'Teléfono de destinatario inválido para WhatsApp');
  const cc=cloudConfig();
  if(cc.token&&cc.phoneId){
   const resp=await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(cc.phoneId)}/messages`,{method:'POST',headers:{Authorization:`Bearer ${cc.token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:normPhone,type:'text',text:{preview_url:false,body:String(textBody||'')}})});
   const data=await resp.json().catch(()=>({}));
   if(!resp.ok)fail(502,data?.error?.message||'Error enviando mensaje por WhatsApp Cloud API');
   return {ok:true,channel:'cloud_api',phone:normPhone,remote_id:data?.messages?.[0]?.id||uuid()};
  }
  if(state==='connected'&&sock){
   const current=sock;
   const result=await current.onWhatsApp(normPhone).catch(()=>null);
   const jid=result?.find(x=>x.exists)?.jid||`${normPhone}@s.whatsapp.net`;
   const messageId=randomBytes(10).toString('hex').toUpperCase();
   await current.sendMessage(jid,{text:String(textBody||'')},{messageId});
   return {ok:true,channel:'baileys',phone:normPhone,remote_id:messageId};
  }
  return {ok:false,channel:'wa_me',phone:normPhone,error:'WhatsApp automático no conectado. Usa el enlace wa.me o conecta tu QR en Configuración → Integraciones → WhatsApp.'};
 }
 async function drain(){if(draining||state!=='connected'||!sock)return;draining=true;const current=sock;try{await processWhatsappQueue(db,{sender:config().sender_jid,connected:true,send:async(phone,pdf,saleId,messageId)=>{if(state!=='connected'||sock!==current)throw Error('Disconnected');const result=await current.onWhatsApp(phone);const person=result?.find(x=>x.exists);if(!person)throw Error('Recipient not available');const sale=db.prepare('SELECT number FROM sales WHERE id=?').get(saleId);await current.sendMessage(person.jid,{document:pdf,mimetype:'application/pdf',fileName:'MEIBO-comprobante-'+String(sale.number).padStart(6,'0')+'.pdf',caption:'Tu comprobante de compra MEIBO. Documento interno sin validez tributaria.'},{messageId});}});}finally{draining=false;if(state==='connected'&&db.prepare("SELECT 1 FROM whatsapp_outbox WHERE status='queued' LIMIT 1").get()){clearTimeout(timer);timer=setTimeout(()=>drain().catch(()=>{}),1000);timer.unref();}}}
 async function connect(){if(disposed)fail(409,'Servicio detenido');if(loading)return loading;if(sock&&['connecting','qr','connected'].includes(state))return status(true);const gen=++generation;db.prepare("UPDATE whatsapp_connection SET enabled=1,last_error='' WHERE id=1").run();state='connecting';loading=(async()=>{try{const {baileys:b,qrcode,pino}=await modules(),logger=pino({level:'silent'}),auth=await whatsappAuth(db,{keyPath,module:b});if(gen!==generation||disposed)return status();const socket=b.default({auth:{creds:auth.state.creds,keys:b.makeCacheableSignalKeyStore({get:(...args)=>gen===generation?auth.state.keys.get(...args):Promise.resolve({}),set:(...args)=>gen===generation?auth.state.keys.set(...args):Promise.resolve()},logger)},logger,browser:['MEIBO','Chrome','1.0.0'],syncFullHistory:false,shouldSyncHistoryMessage:()=>false,markOnlineOnConnect:false,shouldIgnoreJid:jid=>jid?.endsWith('@g.us')||jid==='status@broadcast',getMessage:async()=>undefined});sock=socket;
 socket.ev.on('creds.update',()=>{if(gen===generation&&!disposed)try{auth.saveCreds();}catch{state='error';db.prepare("UPDATE whatsapp_connection SET last_error='No se pudo guardar la sesión de WhatsApp.' WHERE id=1").run();}});
 socket.ev.on('connection.update',async update=>{if(gen!==generation||disposed)return;try{if(update.qr){qr=await qrcode.toDataURL(update.qr,{width:280,margin:2});if(gen!==generation)return;qrAt=Date.now();state='qr';}
 if(update.connection==='open'){state='connected';qr=null;qrAt=null;retries=0;const sender=b.jidNormalizedUser(socket.user.id);db.prepare("UPDATE whatsapp_connection SET sender_jid=?,connected_at=?,last_error='' WHERE id=1").run(sender,now());await drain();}
 if(update.connection==='close'){sock=null;qr=null;qrAt=null;state='disconnected';const code=update.lastDisconnect?.error?.output?.statusCode;if(code===b.DisconnectReason.loggedOut||code===b.DisconnectReason.badSession){generation++;db.prepare('DELETE FROM whatsapp_auth').run();db.prepare("UPDATE whatsapp_connection SET enabled=0,last_error='La sesión terminó. Conecta WhatsApp nuevamente.' WHERE id=1").run();}
 else if(config().enabled&&retries<6){state='reconnecting';const delay=Math.min(60000,2000*2**retries++);clearTimeout(timer);timer=setTimeout(()=>connect().catch(()=>{}),delay);timer.unref();}else db.prepare("UPDATE whatsapp_connection SET last_error='No se pudo restablecer la conexión. Vuelve a conectar WhatsApp.' WHERE id=1").run();}
 }catch{if(gen===generation)db.prepare("UPDATE whatsapp_connection SET last_error='No se pudo completar la conexión de WhatsApp.' WHERE id=1").run();}});
 socket.ev.on('messages.update',events=>{if(gen!==generation||disposed)return;for(const event of events){if(!event.key?.fromMe||!event.key.id)continue;const ack=event.update?.status;if(ack>=2){const next=ack>=4?'read':ack===3?'delivered':'sent';db.prepare("UPDATE whatsapp_outbox SET status=CASE WHEN status='read' OR status='delivered' AND ?='sent' THEN status ELSE ? END,error='',updated_at=? WHERE remote_id=? AND status IN ('sending','sent','delivered','read','uncertain')").run(next,next,now(),event.key.id);}}});
 socket.ev.on('messages.upsert',async({messages,type})=>{if(gen!==generation||disposed||type!=='notify'||!onIncomingMessage)return;for(const msg of messages||[]){try{if(msg.key?.fromMe||!msg.message||!msg.key?.remoteJid||msg.key.remoteJid.endsWith('@g.us')||msg.key.remoteJid==='status@broadcast')continue;const body=(msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.buttonsResponseMessage?.selectedDisplayText||msg.message.listResponseMessage?.title||msg.message.templateButtonReplyMessage?.selectedDisplayText||'').trim();if(!body)continue;const senderPhone=String(msg.key.remoteJid.split('@')[0]||'').replace(/[^0-9]/g,'');await onIncomingMessage({phone:senderPhone,text:body,remoteId:msg.key.id||uuid(),channel:'baileys'});}catch{}}});
 return status(true);
 }catch{state='error';db.prepare("UPDATE whatsapp_connection SET last_error='No se pudo iniciar WhatsApp. Revisa la conexión y vuelve a intentarlo.' WHERE id=1").run();return status(true);}finally{loading=null;}})();return loading;}
 async function disconnect(){generation++;clearTimeout(timer);const current=sock;sock=null;qr=null;qrAt=null;state='disconnected';db.prepare("UPDATE whatsapp_connection SET enabled=0,sender_jid='',connected_at=NULL,last_error='' WHERE id=1").run();db.prepare('DELETE FROM whatsapp_auth').run();db.prepare("UPDATE whatsapp_outbox SET status='cancelled',error='WhatsApp fue desconectado antes del envío.',updated_at=? WHERE status='queued'").run(now());try{await current?.logout();}catch{}try{current?.end(undefined);}catch{}}
 function start(){db.prepare("UPDATE whatsapp_outbox SET status='uncertain',error='El servicio reinició durante el envío. Revisa antes de repetirlo.',updated_at=? WHERE status='sending'").run(now());if(config().enabled)connect().catch(()=>{});}
 function stop(){disposed=true;generation++;clearTimeout(timer);try{sock?.end(undefined);}catch{}sock=null;}
 return {status,connect,disconnect,drain,sendText,start,stop};
}
