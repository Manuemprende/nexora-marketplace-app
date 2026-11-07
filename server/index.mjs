try { process.loadEnvFile?.(); } catch {}
import {canManageAllSales,requireSaleAccess} from './sale-visibility.mjs';
import {sellerSales} from './seller-sales.mjs';
import {queueEvolutCancellation,processEvolutCancellations} from './evolut-cancel.mjs';
import {loadDropiOrderDetail} from './dropi-order-window.mjs';
import {demandInbox,demandSettings,saveDemandSettings} from './demand-alerts.mjs';
import {createSaleNotifications,saleNotificationInbox,readSaleNotifications} from './sale-notifications.mjs';
import {featuredProducts,saveFeaturedProducts} from './pos-featured.mjs';
import {createDropiWebConnector} from './dropi-web.mjs';
import {createConnectionOverview} from './connection-overview.mjs';
import {startEvolutWorker,evolutSyncStatus,evolutLabel,validateEvolutPreparation,processEvolutPreparation} from './evolut-orders.mjs';
import {createWhatsappService,queueWhatsappReceipt,whatsappMessages,saleForWhatsapp,receiptCustomerPhone} from './whatsapp.mjs';
import {receiptPdf} from './receipt-pdf.mjs';
import {dropiOrderPreviews,dropiPackingReviews} from './dropi-order-preview.mjs';
import {supportBoard,requestPackingSupport,actPackingSupport} from './packing-support.mjs';
import {preparedSyncStatus,setPreparedSyncConfig,startPreparedJumpsellerWorker} from './jumpseller-prepared.mjs';
import {cashStatusForUser,cashSessionDetail,openCashSession,closeCashSession,cashMovement,refundCashPayment} from './cash-drawer.mjs';
import {receiveEnviosUrbanosWebhook,processEnviosUrbanosEvents,startEnviosUrbanosWorker} from './envios-urbanos-webhooks.mjs';
import {startDropiOAuth,finishDropiOAuth,dropiOAuthStatus,checkDropiOAuth,disconnectDropiOAuth,callDropiMcpTool,createDropiOrderViaMcp,quoteDropiShippingViaMcp} from './dropi-oauth.mjs';
import {createProductWithPublications} from './new-product.mjs';
import {publicProductImage,publicProductJpeg,publicationImageUrl} from './publication-media.mjs';
import {readFile} from 'node:fs/promises';
import {pickupLabel} from './pickup-label.mjs';
import {orderSyncStatus} from './jumpseller-order-sync.mjs';
import {factoStatus} from './facto.mjs';
import {labelWithReferences} from './shipping-label-layout.mjs';
import {importJumpsellerOrder,shippingLabel} from './jumpseller-orders.mjs';
import {publicationList,savePublication,publishProduct,publicationCategories,publicationChannels,walmartFields,refreshWalmartPublication,startWalmartFeedPolling} from './publications.mjs';
import {prepareChannelMasters,connectChannelMasters,addChannelVariant} from './channel-masters.mjs';
import {channelCatalog,associateListing} from './channel-catalog.mjs';
import {customers,createCustomer,updateCustomer,guestCustomer} from './customers.mjs';
import {savePolicy,savePublishedStock,returnSources,receiveReturn,returnHistory,businessSettings,saveBusinessSettings} from './meeting.mjs';
import {identity,authorize,authorizeSupportAction,userList,saveUser,setUserActive,changeUserPassword} from './access.mjs';
import {posCatalog,customerForSale} from './pos.mjs';
import {storeImage} from './images.mjs';
import {mercadolibreRoutes} from './mercadolibre.mjs';
import {notificationPath,receiveNotification} from './mercadolibre-notifications.mjs';
import {dropeaRoutes} from './dropea.mjs';
import {dropeaWebhookPath,receiveDropeaWebhook} from './dropea-notifications.mjs';
import {dropiClient} from './dropi.mjs';
import {facebookService} from './facebook.mjs';
import {getLandingBySlug,listLandings,createOrUpdateLiveLanding,deleteLiveLanding,createLiveLandingOrder,getLiveStock,getRadarWinners} from './live-landings.mjs';
import {trackVisit,receiveLandingOrder,getLandingsMetrics,registerLanding,deleteLanding,getLandingOrders,getAllLandingOrders,updateLandingOrderStatus,updateLandingOrderDetails,deleteLandingOrder,cleanupTestLandingOrders,sendLandingOrderWhatsAppRequest,processIncomingWhatsAppConfirmation,verifyWhatsAppCloudWebhook,receiveWhatsAppCloudWebhook,getLandingOrderAuditLogs,sendOrderToSupplier,quoteLandingOrderShipping,updateLandingMapping,toggleLandingCampaign} from './landings.mjs';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase, verifyPassword } from './database.mjs';
import { ApiError,fail,text,catalog,categories,addCategory,createVariant,editVariant,requireVariant,changeStock,addCode,editPlatformPrice,movements,sales,duplicateSale,cancelSale,checkout,orders,createOrder,savePackingDelivery,deliverPickup,startPreparation,cancelPreparation,completePreparation,packItem,cancelOrder,demoOrder,importBatches,importBatchSummaries,importBatch,stageImport,commitImport,storeProducts,storeCreateOrder,storeWebhook } from './service.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const dummyHash='00000000000000000000000000000000:'+ '00'.repeat(64);
async function readBody(req,limit=100000) {
  let body='';
  for await (const chunk of req) { body+=chunk; if(Buffer.byteLength(body)>limit) fail(413,'Solicitud demasiado grande'); }
  try { const parsed=JSON.parse(body||'{}'); if(!parsed||Array.isArray(parsed)||typeof parsed!=='object') fail(400,'JSON inválido'); return parsed; }
  catch(error) { if(error instanceof ApiError) throw error; fail(400,'JSON inválido'); }
}
export function createApi({dbPath=resolve('data/nexora.sqlite'),allowDemo=true,requireCustomer=false}={}) {
  const db=openDatabase(dbPath,{seedDemoData:allowDemo}), attempts=new Map();
  const saleNotifications=createSaleNotifications(db);
  const dropiWeb=createDropiWebConnector(db),connectionOverview=createConnectionOverview(db,dropiWeb);const whatsapp=createWhatsappService(db,{onIncomingMessage:msg=>processIncomingWhatsAppConfirmation(db,msg)});let stopPrepared=()=>{};const restartPrepared=()=>{stopPrepared();stopPrepared=startPreparedJumpsellerWorker(db);};
  const production=process.env.NODE_ENV==='production';
  const allowedOrigins=production?[...(process.env.NEXORA_PUBLIC_ORIGIN||'').split(','),...(process.env.MEIBO_ALLOWED_ORIGINS||'').split(',')].filter(Boolean):['http://localhost:4876','http://127.0.0.1:4876','http://localhost:5173','http://127.0.0.1:5173','http://localhost:3001','http://127.0.0.1:3001'];
  const secureCookie=production?'; Secure':'';
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      const path=url.pathname,method=req.method;
      const isLiveLandingOrder = path==='/api/orders' && method==='POST' && req.headers['x-wentix-source']==='live-landing-cod';
      const isLandingTrack = (path==='/api/landings/track' || path==='/api/landings/order') && method==='POST';
      const isTrackerJs = path==='/api/landings/tracker.js' && method==='GET';
      const isPublicLandingRoute = /^\/api\/landings\/[^/]+$/.test(path) && method==='GET' && !['metrics','track','order','register','tracker.js','all-orders','orders','mapping'].includes(path.split('/').pop());
      const isPublicStockRoute = path==='/api/stock' && method==='GET';

      if(method==='OPTIONS' || isLiveLandingOrder || isLandingTrack || isTrackerJs || isPublicLandingRoute || isPublicStockRoute || path.startsWith('/api/store/')) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wentix-Source, x-nexora-request, x-meibo-request, x-visitor-id');
        if(method==='OPTIONS') { res.writeHead(204); return res.end(); }
      }

      if(isTrackerJs) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        const nexoraHost = (process.env.NEXORA_PUBLIC_ORIGIN?.split(',')[0]) || 'https://nexora.wentixai.pro';
        const trackerCode = `(function(){
  var s = document.currentScript || document.querySelector('script[data-landing]');
  var landingId = s ? (s.getAttribute('data-landing') || 'aerosleep') : 'aerosleep';
  var host = '${nexoraHost}';
  var vId = localStorage.getItem('nx_vid');
  if(!vId){
    vId = 'usr_' + Math.random().toString(36).substring(2,10) + '_' + Date.now().toString(36);
    localStorage.setItem('nx_vid', vId);
  }
  var p = new URLSearchParams(window.location.search);
  var src = p.get('utm_source') || 'direct';
  var camp = p.get('utm_campaign') || '';
  function ping(){
    try {
      var payload = JSON.stringify({ landing_id: landingId, visitor_id: vId, utm_source: src, utm_campaign: camp });
      if(navigator.sendBeacon){ navigator.sendBeacon(host + '/api/landings/track', payload); }
      else { fetch(host + '/api/landings/track', { method:'POST', headers:{'Content-Type':'application/json'}, body: payload, keepalive:true }).catch(function(){}); }
    } catch(e){}
  }
  ping();
  setInterval(ping, 25000);
  window.nexoraSubmitCODOrder = function(orderInfo){
    return fetch(host + '/api/landings/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ landing_id: landingId, visitor_id: vId, utm_source: src, utm_campaign: camp }, orderInfo))
    }).then(function(r){ return r.json(); });
  };
})();`;
        return res.end(trackerCode);
      }

      if(path==='/api/landings/track' && method==='POST') return send(200, trackVisit(db, await readBody(req, 65536)));
      if(path==='/api/landings/order' && method==='POST') return send(201, receiveLandingOrder(db, await readBody(req, 65536), { whatsapp }));
      if(path==='/api/webhooks/whatsapp' && method==='GET') {
        const verified = verifyWhatsAppCloudWebhook(Object.fromEntries(url.searchParams.entries()));
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.writeHead(200);
        return res.end(verified.challenge);
      }
      if(path==='/api/webhooks/whatsapp' && method==='POST') {
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)fail(413,'Notificación demasiado grande');chunks.push(chunk);}
        const receipt = await receiveWhatsAppCloudWebhook(db, Buffer.concat(chunks), req.headers);
        return send(200, receipt);
      }

      if(!['GET','POST','PUT','DELETE'].includes(method)) fail(405,'Método no permitido');
      if(path==='/api/webhooks/envios-urbanos'&&method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Usa application/json');
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)fail(413,'Notificación demasiado grande');chunks.push(chunk);}
        const receipt=await receiveEnviosUrbanosWebhook(db,Buffer.concat(chunks),req.headers['x-eu-signature'],req.headers['x-eu-delivery-id']);
        send(202,receipt);setImmediate(()=>processEnviosUrbanosEvents(db).catch(()=>console.error(JSON.stringify({event:'envios_urbanos_queue_error'}))));return;
      }
      if(path===notificationPath&&method==='POST') {
        if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Usa application/json');
        receiveNotification(db,await readBody(req,16384));
        return send(200,{ok:true});
      }
      if(path===dropeaWebhookPath&&method==='POST') {
        let rawBody='';
        for await (const chunk of req) { rawBody+=chunk; if(Buffer.byteLength(rawBody)>100000) fail(413,'Payload demasiado grande'); }
        const result = receiveDropeaWebhook(db, rawBody, req.headers);
        return send(200, { ok: true, ...result });
      }
      const isPublicEndpoint = path.startsWith('/api/store/') || path === notificationPath || path === dropeaWebhookPath || path === '/api/webhooks/envios-urbanos' || isLiveLandingOrder || isLandingTrack || isTrackerJs || isPublicLandingRoute || isPublicStockRoute;
      if(method!=='GET' && !isPublicEndpoint) {
        const origin=req.headers.origin;
        if(origin&&allowedOrigins.length&&!allowedOrigins.includes(origin)) fail(403,'Origen no permitido');
        const isAuthorized = req.headers['x-nexora-request']==='1' || req.headers['x-meibo-request']==='1';
        if(!isAuthorized) fail(403,'Solicitud no autorizada');
        if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'Usa application/json');
      }
      if(path==='/api/integrations/dropi/callback'&&method==='GET'){
        const binding=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('meibo_dropi_oauth='))?.slice(18);
        res.setHeader('Referrer-Policy','no-referrer');
        try{await finishDropiOAuth(db,url.searchParams,binding);}catch{
          res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");res.writeHead(400);
          return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexión con Dropi · NEXORA</title><body style="font-family:Arial,sans-serif;background:#f3f6fb;color:#183455;padding:32px"><main style="max-width:480px;margin:12vh auto;background:white;padding:28px;border-radius:16px"><h1>Conexión con Dropi</h1><p>No se pudo completar la autorización. Vuelve a Configuración para iniciar la conexión nuevamente.</p><a href="/#settings">Volver a NEXORA</a></main></body></html>');
        }
        res.setHeader('Set-Cookie','meibo_dropi_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/dropi/callback; Max-Age=0');
        res.writeHead(303,{Location:'/#settings'});return res.end();
      }
      const publicMediaMatch=/^\/api\/public-product-images\/([a-f0-9-]{36})\.(webp|jpg)$/.exec(path);
      if(publicMediaMatch&&method==='GET'){const image=publicMediaMatch[2]==='jpg'?await publicProductJpeg(db,publicMediaMatch[1]):publicProductImage(db,publicMediaMatch[1]);if(!image)fail(404,'Imagen no encontrada');res.setHeader('Content-Type',publicMediaMatch[2]==='jpg'?'image/jpeg':'image/webp');res.setHeader('Cache-Control','public, max-age=86400');res.writeHead(200);return res.end(Buffer.from(image.content));}
      if(isPublicLandingRoute) {
        const slug = decodeURIComponent(path.split('/').pop() || '');
        const cfg = getLandingBySlug(slug);
        if(!cfg) fail(404, 'Landing no encontrada');
        return send(200, cfg);
      }
      if(isPublicStockRoute) return send(200, getLiveStock(db, url.searchParams.get('sku') || ''));
      if(isLiveLandingOrder) return send(201, createLiveLandingOrder(db, await readBody(req, 65536)));
      if(path==='/api/store/products'&&method==='GET') return send(200,storeProducts(db,Object.fromEntries(url.searchParams.entries())));
      if(path==='/api/store/orders'&&method==='POST') return send(201,storeCreateOrder(db,await readBody(req,65536)));
      if(path==='/api/store/webhook'&&method==='POST') return send(200,storeWebhook(db,await readBody(req,131072),req.headers));
      if(path==='/api/health'&&method==='GET') return send(200,{ok:true,platform:'Nexora',storage:'SQLite local'});
      if(path==='/api/login'&&method==='POST') {
        const input=await readBody(req),email=text(input.email,'Correo',254,true).toLowerCase(),password=text(input.password,'Contraseña',200,true);
        const key=`${req.socket.remoteAddress}:${email}`,time=Date.now();
        for(const [k,v] of attempts) if(v.until<time) attempts.delete(k);
        const attempt=attempts.get(key);
        if(attempt?.count>=10) fail(429,'Demasiados intentos. Espera 15 minutos.');
        const user=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
        const valid=verifyPassword(password,user?.password_hash??dummyHash);
        if(!user||!valid) { attempts.set(key,{count:(attempt?.count??0)+1,until:attempt?.until??time+900000}); fail(401,'Correo o contraseña incorrectos'); }
        attempts.delete(key);
        db.prepare('DELETE FROM sessions WHERE expires_at<?').run(time);
        const token=randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),user.id,time+30*24*3600000);
        res.setHeader('Set-Cookie',`meibo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30*24*3600}${secureCookie}`);
        return send(200,identity(db,{id:user.id,email:user.email,role:user.role}));
      }
      const cookies=req.headers.cookie?.split(';').map(x=>x.trim())||[];
      const token=cookies.find(x=>x.startsWith('meibo_session='))?.slice(14) || (path==='/api/integrations/mercadolibre/callback'?cookies.find(x=>x.startsWith('nexora_oauth_session='))?.slice(21):undefined);
      const sessionUser=token?db.prepare('SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(digest(token),Date.now()):null;
      const user=sessionUser?identity(db,sessionUser):null;
      if(await mercadolibreRoutes({db,user,url,req,res,token,readBody,secureCookie}))return;
      if(await dropeaRoutes({db,user,url,req,res,readBody}))return;
      if(path==='/api/session'&&method==='GET') return send(200,user??null);
      if(!user) fail(401,'Inicia sesión para continuar');
      if(path==='/api/logout'&&method==='POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
        res.setHeader('Set-Cookie',`meibo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`);
        return send(200,{ok:true});
      }
      authorize(user,path,method);
      const scopedSale=/^\/api\/sales\/([^/]+)\//.exec(path);if(scopedSale)requireSaleAccess(db,user,decodeURIComponent(scopedSale[1]));
      if(path.startsWith('/api/integrations/dropi-web/')){
        if(user.role!=='admin')fail(403,'Solo el administrador gestiona Dropi web');
        const action=path.split('/').pop();
        if(action==='status'&&method==='GET')return send(200,await dropiWeb.status());
        if(method==='POST'&&['connect','verify','check','compare','disconnect'].includes(action))return send(200,await dropiWeb[action](await readBody(req),user.id));
      }
      if(path==='/api/order-sync/connections'&&method==='GET')return send(200,await connectionOverview());
      if(path.startsWith('/api/integrations/whatsapp/')){
        if(user.role!=='admin')fail(403,'Solo un administrador conecta WhatsApp');
        if(path==='/api/integrations/whatsapp/status'&&method==='GET')return send(200,whatsapp.status(true));
        if(path==='/api/integrations/whatsapp/connect'&&method==='POST')return send(200,await whatsapp.connect());
        if(path==='/api/integrations/whatsapp/disconnect'&&method==='POST'){await whatsapp.disconnect();return send(200,whatsapp.status(true));}
      }
      if(path==='/api/order-sync/jumpseller-prepared/config'&&method==='POST'){if(user.role!=='admin')fail(403,'Solo el administrador configura los estados');const input=await readBody(req);if(typeof input.enabled!=='boolean')fail(400,'Configuración inválida');const result=setPreparedSyncConfig(db,input.enabled);restartPrepared();return send(200,result);}
      if(path==='/api/whatsapp/status'&&method==='GET')return send(200,whatsapp.status());
      const receiptPdfMatch=/^\/api\/sales\/([^/]+)\/receipt-pdf$/.exec(path);
      if(receiptPdfMatch&&method==='GET'){const sale=saleForWhatsapp(db,receiptPdfMatch[1]),pdf=await receiptPdf(sale);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="NEXORA-comprobante-'+String(sale.number).padStart(6,'0')+'.pdf"');res.writeHead(200);return res.end(pdf);}
      const whatsappSale=/^\/api\/sales\/([^/]+)\/whatsapp$/.exec(path);
      if(whatsappSale&&method==='GET'){const sale=saleForWhatsapp(db,whatsappSale[1]);return send(200,{customer_phone:receiptCustomerPhone(db,sale),connection:whatsapp.status(),messages:whatsappMessages(db,whatsappSale[1])});}
      if(whatsappSale&&method==='POST'){const result=await queueWhatsappReceipt(db,whatsappSale[1],await readBody(req),user.id);send(202,result);setImmediate(()=>whatsapp.drain().catch(()=>{}));return;}
      if(path.startsWith('/api/integrations/dropi/')){
        if(user.role!=='admin')fail(403,'Solo un administrador puede gestionar esta conexión');
        if(path==='/api/integrations/dropi/status'&&method==='GET')return send(200,await dropiOAuthStatus(db));
        if(path==='/api/integrations/dropi/connect'&&method==='POST'){
          const reqOrigin=req.headers.origin||`https://${req.headers['x-forwarded-host']||req.headers.host||'market.wentixai.digital'}`;
          const result=await startDropiOAuth(db,user,digest(token),reqOrigin);
          res.setHeader('Set-Cookie',`meibo_dropi_oauth=${result.browser}; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/dropi/callback; Max-Age=600`);
          return send(200,{url:result.url});
        }
        if(path==='/api/integrations/dropi/check'&&method==='POST'){await checkDropiOAuth();return send(200,await dropiOAuthStatus(db));}
        if(path==='/api/integrations/dropi/disconnect'&&method==='POST'){await disconnectDropiOAuth(db);return send(200,await dropiOAuthStatus(db));}
        if(path==='/api/integrations/dropi/mcp-call'&&method==='POST'){
          const body=await readBody(req);
          if(!body.tool)fail(400,'Herramienta MCP requerida');
          return send(200,await callDropiMcpTool(String(body.tool),body.arguments||{}));
        }
        if(path==='/api/integrations/dropi/create-order'&&method==='POST'){
          const body=await readBody(req);
          return send(200,await createDropiOrderViaMcp(body,{getProductDetail:id=>dropiClient.getProductDetail(id)}));
        }
        if(path==='/api/integrations/dropi/quote-shipping'&&method==='POST'){
          const body=await readBody(req);
          return send(200,await quoteDropiShippingViaMcp({...body,getProductDetail:id=>dropiClient.getProductDetail(id)}));
        }
        fail(404,'Ruta de conexión no encontrada');
      }
      if(path==='/api/packing-support'&&method==='GET')return send(200,supportBoard(db,user.id,url.searchParams.get('history')==='1'));
      const supportAction=/^\/api\/packing-support\/([^/]+)$/.exec(path);if(supportAction&&method==='POST'){const input=await readBody(req);authorizeSupportAction(user,input.action);return send(200,actPackingSupport(db,decodeURIComponent(supportAction[1]),input,user.id,user.role==='admin'));}
      const supportCreate=/^\/api\/orders\/([^/]+)\/support$/.exec(path);if(supportCreate&&method==='POST')return send(201,requestPackingSupport(db,decodeURIComponent(supportCreate[1]),await readBody(req),user.id));
      if(path==='/api/order-sync/jumpseller-prepared'&&method==='GET')return send(200,preparedSyncStatus(db));
      if(path==='/api/order-sync/evolut'&&method==='GET')return send(200,evolutSyncStatus(db));
      if(path==='/api/order-sync/jumpseller'&&method==='GET')return send(200,orderSyncStatus(db));
      if(path==='/api/facto/status'&&method==='GET')return send(200,await factoStatus());
      if(path==='/api/publication-options'&&method==='GET')return send(200,{channels:publicationChannels,can_publish:user.role==='admin'});
      if(path==='/api/publication-categories'&&method==='GET'){if(user.role!=='admin')fail(403,'Solo administrador');return send(200,await publicationCategories(url.searchParams.get('platform')));}
      if(path==='/api/walmart/fields'&&method==='GET'){if(user.role!=='admin')fail(403,'Solo administrador');return send(200,walmartFields(url.searchParams.get('category')));}
      const wm=/^\/api\/publications\/([^/]+)\/walmart-status$/.exec(path);if(wm&&method==='POST'){if(user.role!=='admin')fail(403,'Solo administrador');return send(200,await refreshWalmartPublication(db,decodeURIComponent(wm[1])));}
      const pub=/^\/api\/publications\/([^/]+)(\/send)?$/.exec(path);if(pub){if(user.role!=='admin')fail(403,'Solo el administrador publica productos');const id=decodeURIComponent(pub[1]);if(method==='GET'&&!pub[2])return send(200,publicationList(db,id));if(method==='PUT'&&!pub[2])return send(200,savePublication(db,id,await readBody(req)));if(method==='POST'&&pub[2])return send(200,await publishProduct(db,id,(await readBody(req)).platform,{actor:user.id}));fail(405,'Método no admitido');}
      if(path==='/api/channel-catalog/prepare-masters'&&method==='POST'){if(user.role!=='admin')fail(403,'Solo el administrador incorpora catálogos');return send(200,prepareChannelMasters(db,user.id));}
      if(path==='/api/channel-catalog/connect'&&method==='POST')return send(200,connectChannelMasters(db,await readBody(req),user.id));
      const channelVariant=/^\/api\/channel-catalog\/([^/]+)\/variants$/.exec(path);
      if(channelVariant&&method==='POST')return send(201,addChannelVariant(db,decodeURIComponent(channelVariant[1]),await readBody(req),user.id));
      if(path==='/api/channel-catalog'&&method==='GET')return send(200,channelCatalog(db,url.searchParams));
      const channelLink=/^\/api\/channel-catalog\/([^/]+)\/associate$/.exec(path);
      if(channelLink&&method==='POST')return send(200,associateListing(db,decodeURIComponent(channelLink[1]),await readBody(req),user.id));
      if(path==='/api/business-settings'&&method==='GET')return send(200,businessSettings(db));
      if(path==='/api/business-settings'&&method==='PUT')return send(200,saveBusinessSettings(db,await readBody(req)));
      if(path==='/api/return-sources'&&method==='GET')return send(200,returnSources(db));
      if(path==='/api/returns'&&method==='GET')return send(200,returnHistory(db));
      if(path==='/api/returns'&&method==='POST')return send(201,receiveReturn(db,await readBody(req),user.id));
      const policyMatch=/^\/api\/variants\/([^/]+)\/policy$/.exec(path);
      if(policyMatch&&method==='PUT')return send(200,savePolicy(db,policyMatch[1],await readBody(req)));
      const publishedMatch=/^\/api\/published-stock\/([^/]+)$/.exec(path);
      if(publishedMatch&&method==='PUT')return send(200,savePublishedStock(db,publishedMatch[1],await readBody(req),user.id));
      const publicImageUrlMatch=/^\/api\/images\/([a-f0-9-]{36})\/public-url$/.exec(path);
      if(publicImageUrlMatch&&method==='POST'){await readBody(req);let base=process.env.MEIBO_PUBLIC_URL||process.env.NEXORA_PUBLIC_ORIGIN?.split(',')[0];if(!base){try{base=JSON.parse(await readFile(process.env.MEIBO_PUBLISH_CREDENTIALS??'/data/publishing-credentials.json','utf8')).public_base_url;}catch{fail(409,'Falta configurar el dominio público de las imágenes');}}return send(200,{url:publicationImageUrl(db,'/api/images/'+publicImageUrlMatch[1]+'.webp',base,'jpg')});}
      if(path==='/api/images'&&method==='POST')return send(201,await storeImage(db,await readBody(req,17*1024*1024),user.id));
      const imageMatch=/^\/api\/images\/([a-f0-9-]{36})\.webp$/.exec(path);
      if(imageMatch&&method==='GET'){const image=db.prepare('SELECT content FROM product_images WHERE id=?').get(imageMatch[1]);if(!image)fail(404,'Imagen no encontrada');res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','private, max-age=86400');res.writeHead(200);return res.end(Buffer.from(image.content));}
      if(path==='/api/search'&&method==='GET') {
        const q=text(url.searchParams.get('q')??'','Código',200,true).toLowerCase();
        const rows=catalog(db).filter(p=>p.active);
        const exact=rows.filter(p=>p.sku.toLowerCase()===q||Object.values(p.codes).some(c=>c.toLowerCase()===q));
        const matches=exact.length?exact:rows.filter(p=>`${p.name} ${p.attributes}`.toLowerCase().includes(q));
        return send(200,{matches});
      }
      if(path==='/api/orders/import-jumpseller'&&method==='POST'){if(user.role!=='admin')fail(403,'Solo el administrador importa pedidos');const input=await readBody(req);return send(200,await importJumpsellerOrder(db,String(input.id),user.id));}
      const pickupMatch=/^\/api\/orders\/([^/]+)\/pickup-label$/.exec(path);
      if(pickupMatch&&method==='GET'){const order=orders(db).find(o=>o.id===pickupMatch[1]);if(!order)fail(404,'Pedido no encontrado');const pdf=await pickupLabel(order);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="etiqueta-retiro.pdf"');res.writeHead(200);return res.end(pdf);}
      const labelMatch=/^\/api\/orders\/([^/]+)\/shipping-label$/.exec(path);
      if(labelMatch&&method==='GET'){const channel=db.prepare('SELECT platform FROM external_order_details WHERE order_id=?').get(labelMatch[1])?.platform;let pdf=channel==='Evolut'?await evolutLabel(db,labelMatch[1]):await shippingLabel(db,labelMatch[1]);if(channel!=='Evolut'&&url.searchParams.get('original')!=='1'){const order=orders(db).find(o=>o.id===labelMatch[1]);if(!order.external?.label_attachments?.length&&!order.external?.envios_urbanos)pdf=await labelWithReferences(pdf,{platform:order.platform,reference:order.external_reference,fulfillment:order.external?.fulfillments?.[0],items:order.items.map(i=>({master_sku:i.product?.sku,source_code:i.source_code,qty:i.qty}))});}res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="etiqueta-envio.pdf"');res.writeHead(200);return res.end(pdf);}
      const dropiDetailMatch=/^\/api\/order-previews\/dropi\/(\d+)\/detail$/.exec(path);if(dropiDetailMatch&&method==='GET')return send(200,await loadDropiOrderDetail(db,dropiDetailMatch[1],user.id));
      if(path==='/api/order-previews/dropi'&&method==='GET')return send(200,dropiOrderPreviews(db));
      if(path==='/api/orders'&&method==='GET'){const actual=orders(db),ids=new Set(actual.filter(o=>o.platform==='Dropi').map(o=>o.external_reference));return send(200,[...actual,...dropiPackingReviews(db).filter(o=>!ids.has(o.external_reference))]);}
      const deliveryTypeMatch=/^\/api\/orders\/([^/]+)\/delivery-type$/.exec(path);
      if(deliveryTypeMatch&&method==='POST')return send(200,savePackingDelivery(db,deliveryTypeMatch[1],await readBody(req),user.id));
      const pickupDeliveredMatch=/^\/api\/orders\/([^/]+)\/pickup-delivered$/.exec(path);
      if(pickupDeliveredMatch&&method==='POST')return send(200,deliverPickup(db,pickupDeliveredMatch[1],await readBody(req),user.id));
      const reverseEvolut=/^\/api\/orders\/([^/]+)\/reverse-evolut-preparation$/.exec(path);
      if(reverseEvolut&&method==='POST'){queueEvolutCancellation(db,reverseEvolut[1],await readBody(req),user.id);await processEvolutCancellations(db);return send(200,db.prepare('SELECT status,message FROM evolut_cancel_outbox WHERE order_id=?').get(reverseEvolut[1]));}
      const completeMatch=/^\/api\/orders\/([^/]+)\/complete$/.exec(path);
      if(completeMatch&&method==='POST'){const input=await readBody(req);await validateEvolutPreparation(db,completeMatch[1]);const result=completePreparation(db,completeMatch[1],input,user.id);send(200,result);setImmediate(()=>processEvolutPreparation(db).catch(()=>{}));return;}
      const startMatch=/^\/api\/orders\/([^/]+)\/start$/.exec(path);
      if(startMatch&&method==='POST'){const input=await readBody(req);await validateEvolutPreparation(db,startMatch[1]);return send(200,startPreparation(db,startMatch[1],input,user.id));}
      const stopPreparationMatch=/^\/api\/orders\/([^/]+)\/cancel-preparation$/.exec(path);
      if(stopPreparationMatch&&method==='POST')return send(200,cancelPreparation(db,stopPreparationMatch[1],await readBody(req),user.id));
      const packMatch=/^\/api\/orders\/([^/]+)\/pack$/.exec(path);
      if(packMatch&&method==='POST'){const input=await readBody(req);await validateEvolutPreparation(db,packMatch[1]);const result=packItem(db,packMatch[1],input,user.id);send(200,result);setImmediate(()=>processEvolutPreparation(db).catch(()=>{}));return;}
      if(path==='/api/orders'&&method==='POST') {
        const body = await readBody(req);
        if(body.channel === 'LIVE_LANDING_COD') return send(201, createLiveLandingOrder(db, body));
        return send(201, createOrder(db, body, user.id));
      }
      if(path==='/api/orders/demo'&&method==='POST')return send(201,demoOrder(db,await readBody(req),user.id));
      const cancelMatch=/^\/api\/orders\/([^/]+)\/cancel$/.exec(path);
      if(cancelMatch&&method==='POST')return send(200,cancelOrder(db,cancelMatch[1],await readBody(req),user.id));
      if(path==='/api/imports'&&method==='GET')return send(200,url.searchParams.get('summary')==='1'?importBatchSummaries(db):importBatches(db));
      if(path==='/api/imports'&&method==='POST')return send(201,stageImport(db,await readBody(req),user.id));
      const importDetail=/^\/api\/imports\/([^/]+)$/.exec(path);
      if(importDetail&&method==='GET')return send(200,importBatch(db,decodeURIComponent(importDetail[1])));
      const importMatch=/^\/api\/imports\/([^/]+)\/commit$/.exec(path);
      if(importMatch&&method==='POST')return send(200,commitImport(db,importMatch[1],user.id));
      if(path==='/api/seller-sales'&&method==='GET'){if(user.role!=='admin')fail(403,'Solo el administrador consulta ventas por vendedor');return send(200,sellerSales(db,Object.fromEntries(url.searchParams)));}
      if(path==='/api/customers'&&method==='GET')return send(200,customers(db,url.searchParams.get('q')??''));
      if(path==='/api/customers'&&method==='POST')return send(201,createCustomer(db,await readBody(req),user.id));
      if(path==='/api/customers/guest'&&method==='POST')return send(200,guestCustomer(db,user.id));
      const customerMatch=/^\/api\/customers\/([^/]+)$/.exec(path);
      if(customerMatch&&method==='PUT')return send(200,updateCustomer(db,customerMatch[1],await readBody(req)));
      if(path==='/api/pos/catalog'&&method==='GET')return send(200,posCatalog(db,url.searchParams));
      if(path==='/api/pos/customers'&&method==='GET')return send(200,customers(db,url.searchParams.get('q')||''));
      if(path==='/api/pos/customers'&&method==='POST')return send(201,createCustomer(db,await readBody(req),user.id));
      if(path==='/api/pos/featured'&&method==='GET')return send(200,featuredProducts(db));
      if(path==='/api/pos/featured'&&method==='PUT')return send(200,saveFeaturedProducts(db,await readBody(req)));
      if(path==='/api/categories'&&method==='GET')return send(200,categories(db));
      if(path==='/api/categories'&&method==='POST')return send(201,addCategory(db,await readBody(req)));
      if(path==='/api/catalog'&&method==='GET') return send(200,catalog(db,{summary:url.searchParams.get('view')==='list'}));
      const catalogDetail=/^\/api\/catalog\/([^/]+)$/.exec(path);if(catalogDetail&&method==='GET'){const product=catalog(db,{id:decodeURIComponent(catalogDetail[1])})[0];if(!product)fail(404,'Producto no encontrado');return send(200,product);}
      if(path==='/api/catalog'&&method==='POST'){const body=await readBody(req),input=allowDemo?body:{...body,is_demo:false};if(body.publications?.length&&user.role!=='admin')fail(403,'Solo el administrador prepara publicaciones');return send(201,Array.isArray(body.publications)?createProductWithPublications(db,input,user.id):createVariant(db,input,user.id));}
      const variantMatch=/^\/api\/variants\/([^/]+)$/.exec(path);
      if(variantMatch&&method==='PUT') return send(200,editVariant(db,variantMatch[1],await readBody(req)));
      if(variantMatch&&method==='DELETE') { requireVariant(db,variantMatch[1]); db.prepare('UPDATE variants SET active=0 WHERE id=?').run(variantMatch[1]); return send(200,{ok:true}); }
      const stockMatch=/^\/api\/variants\/([^/]+)\/stock$/.exec(path);
      if(stockMatch&&method==='POST') return send(200,changeStock(db,stockMatch[1],await readBody(req),user.id));
      const codesMatch=/^\/api\/variants\/([^/]+)\/codes$/.exec(path);
      if(codesMatch&&method==='POST') return send(201,addCode(db,codesMatch[1],await readBody(req)));
      const deleteCode=/^\/api\/codes\/([^/]+)$/.exec(path);
      if(deleteCode&&method==='PUT') return send(200,editPlatformPrice(db,deleteCode[1],await readBody(req)));
      if(deleteCode&&method==='DELETE') { db.prepare('DELETE FROM external_codes WHERE id=?').run(deleteCode[1]); return send(200,{ok:true}); }
      if(path==='/api/movements'&&method==='GET') return send(200,movements(db));
      if(path==='/api/cash/status'&&method==='GET')return send(200,cashStatusForUser(db,user));
      if(path==='/api/demand-alerts'&&method==='GET')return send(200,demandInbox(db));
      if(path==='/api/demand-alerts/settings'&&method==='GET')return send(200,demandSettings(db));
      if(path==='/api/demand-alerts/settings'&&method==='PUT')return send(200,saveDemandSettings(db,await readBody(req),user.id));
      if(path==='/api/cash/sale-notifications/inbox'&&method==='GET')return send(200,saleNotificationInbox(db,user.id));
      if(path==='/api/cash/sale-notifications/read'&&method==='POST'){const result=readSaleNotifications(db,user.id,await readBody(req));saleNotifications.changed(user.id);return send(200,result);}
      if(path==='/api/cash/sale-notifications'&&method==='GET')return saleNotifications.connect(req,res,user,digest(token),url);
      const cashDetail=/^\/api\/cash\/sessions\/([^/]+)$/.exec(path);if(cashDetail&&method==='GET')return send(200,cashSessionDetail(db,decodeURIComponent(cashDetail[1])));
      if(path==='/api/cash/open'&&method==='POST')return send(201,openCashSession(db,await readBody(req),user.id));
      if(path==='/api/cash/close'&&method==='POST')return send(200,closeCashSession(db,await readBody(req),user.id));
      if(path==='/api/cash/movements'&&method==='POST')return send(201,cashMovement(db,await readBody(req),user.id));
      if(path==='/api/cash/refunds'&&method==='POST')return send(201,refundCashPayment(db,await readBody(req),user.id));
      const duplicateSaleMatch=/^\/api\/sales\/([^/]+)\/duplicate$/.exec(path);
      if(duplicateSaleMatch&&method==='POST')return send(201,duplicateSale(db,duplicateSaleMatch[1],await readBody(req),user.id));
      const cancelSaleMatch=/^\/api\/sales\/([^/]+)\/cancel$/.exec(path);
      if(cancelSaleMatch&&method==='POST')return send(200,cancelSale(db,cancelSaleMatch[1],await readBody(req),user.id));
      if(path==='/api/sales'&&method==='GET') return send(200,sales(db,{actorId:canManageAllSales(user)?null:user.id}));
      if(path==='/api/sales'&&method==='POST'){
        const body=customerForSale(db,await readBody(req));
        const result=checkout(db,{...body,cash_control:body.cash_control===true},user.id);
        saleNotifications.publish(result.id);
        return send(201,result);
      }
      if(path==='/api/dashboard'&&method==='GET') {
        const products=catalog(db).filter(p=>p.active),history=movements(db);
        return send(200,{skus:products.length,units:products.reduce((n,p)=>n+p.stock-p.reserved,0),low:products.filter(p=>p.stock-p.reserved>0&&p.stock-p.reserved<p.low_threshold).length,pending:products.filter(p=>!p.stock_confirmed).length,out:products.filter(p=>p.stock_confirmed&&p.stock-p.reserved===0).length,sales:db.prepare("SELECT COUNT(*) n FROM sales WHERE status='completed'").get().n,recent:history.slice(0,8)});
      }
      if(path==='/api/users'&&method==='GET') return send(200,userList(db));
      if(path==='/api/users'&&method==='POST')return send(201,saveUser(db,await readBody(req)));
      const passwordMatch=/^\/api\/users\/([^/]+)\/password$/.exec(path);
      if(passwordMatch&&method==='PUT')return send(200,changeUserPassword(db,passwordMatch[1],await readBody(req),user.id,digest(token)));
      const userStatusMatch=/^\/api\/users\/([^/]+)\/active$/.exec(path);
      if(userStatusMatch&&method==='PUT')return send(200,setUserActive(db,userStatusMatch[1],await readBody(req),user.id));
      const userMatch=/^\/api\/users\/([^/]+)$/.exec(path);
      if(userMatch&&method==='PUT')return send(200,saveUser(db,await readBody(req),userMatch[1],user.id));
      if(path==='/api/dropi/products'&&method==='GET') {
        const q = url.searchParams.get('q') || '';
        const country = url.searchParams.get('country') || 'CHILE';
        const limit = Number(url.searchParams.get('limit') || 36);
        const startData = Number(url.searchParams.get('startData') || url.searchParams.get('offset') || 0);
        const supplier_id = url.searchParams.get('supplier_id') ? Number(url.searchParams.get('supplier_id')) : null;
        return send(200, await dropiClient.searchProducts({ keywords: q, country, pageSize: limit, startData, supplier_id }));
      }
      if(path==='/api/dropi/orders'&&method==='GET') return send(200, await dropiClient.getOrders({ result_number: 50 }));
      if(path==='/api/dropi/suppliers'&&method==='GET') return send(200, await dropiClient.getSuppliers({ query: url.searchParams.get('q') || '' }));
      if(path==='/api/dropi/import'&&method==='POST') {
        const body = await readBody(req);
        return send(200, await dropiClient.importProductToNexora(db, body.product_id, user.id, body.product || null));
      }
      if(path==='/api/dropi/sync-orders'&&method==='POST') return send(200, await dropiClient.syncOrdersToNexora(db, user.id));
      if(path==='/api/radar/winners'&&method==='GET') return send(200, await getRadarWinners(Object.fromEntries(url.searchParams.entries())));
      if(path==='/api/landings/all-orders'&&method==='GET') return send(200, getAllLandingOrders(db, Object.fromEntries(url.searchParams.entries())));
      if(path==='/api/landings/orders/cleanup-test'&&method==='POST') return send(200, cleanupTestLandingOrders(db, await readBody(req).catch(() => ({}))));
      const orderStatusMatch = /^\/api\/landings\/orders\/([^/]+)\/status$/.exec(path);
      if(orderStatusMatch && method==='PUT') return send(200, updateLandingOrderStatus(db, decodeURIComponent(orderStatusMatch[1]), await readBody(req)));
      const orderWaReqMatch = /^\/api\/landings\/orders\/([^/]+)\/whatsapp-confirm-request$/.exec(path);
      if(orderWaReqMatch && method==='POST') return send(200, await sendLandingOrderWhatsAppRequest(db, decodeURIComponent(orderWaReqMatch[1]), { whatsapp, ...(await readBody(req).catch(() => ({}))) }));
      const orderWaReplyMatch = /^\/api\/landings\/orders\/([^/]+)\/whatsapp-reply$/.exec(path);
      if(orderWaReplyMatch && method==='POST') return send(200, await processIncomingWhatsAppConfirmation(db, { orderId: decodeURIComponent(orderWaReplyMatch[1]), ...(await readBody(req)) }));
      const orderAuditMatch = /^\/api\/landings\/orders\/([^/]+)\/audit-logs$/.exec(path);
      if(orderAuditMatch && method==='GET') return send(200, getLandingOrderAuditLogs(db, decodeURIComponent(orderAuditMatch[1])));
      const orderEditMatch = /^\/api\/landings\/orders\/([^/]+)$/.exec(path);
      if(orderEditMatch && method==='PUT') return send(200, updateLandingOrderDetails(db, decodeURIComponent(orderEditMatch[1]), await readBody(req)));
      if(orderEditMatch && method==='DELETE') return send(200, deleteLandingOrder(db, decodeURIComponent(orderEditMatch[1])));
      const orderSendSupplierMatch = /^\/api\/landings\/orders\/([^/]+)\/send-supplier$/.exec(path);
      if(orderSendSupplierMatch && method==='POST') return send(200, await sendOrderToSupplier(db, decodeURIComponent(orderSendSupplierMatch[1]), await readBody(req).catch(() => ({}))));
      const orderQuoteDropiMatch = /^\/api\/landings\/orders\/([^/]+)\/quote-dropi$/.exec(path);
      if(orderQuoteDropiMatch && method==='POST') return send(200, await quoteLandingOrderShipping(db, decodeURIComponent(orderQuoteDropiMatch[1])));
      const landingMappingMatch = /^\/api\/landings\/mapping\/([^/]+)$/.exec(path);
      if(landingMappingMatch && method==='PUT') return send(200, await updateLandingMapping(db, decodeURIComponent(landingMappingMatch[1]), await readBody(req), user.id));
      const landingCampaignMatch = /^\/api\/landings\/campaign\/([^/]+)$/.exec(path);
      if(landingCampaignMatch && (method==='PUT' || method==='POST')) return send(200, toggleLandingCampaign(db, decodeURIComponent(landingCampaignMatch[1]), await readBody(req)));
      if(path==='/api/landings/metrics'&&method==='GET') return send(200, getLandingsMetrics(db, Object.fromEntries(url.searchParams.entries())));
      if(path==='/api/landings/register'&&method==='POST') return send(200, await registerLanding(db, await readBody(req), user.id));
      const landingOrdersMatch = /^\/api\/landings\/orders\/([^/]+)$/.exec(path);
      if(landingOrdersMatch && method==='GET') return send(200, getLandingOrders(db, decodeURIComponent(landingOrdersMatch[1])));
      const deleteLandingManageMatch = /^\/api\/landings\/manage\/([^/]+)$/.exec(path);
      if(deleteLandingManageMatch && method==='DELETE') return send(200, deleteLanding(db, decodeURIComponent(deleteLandingManageMatch[1])));
      if(path==='/api/landings'&&method==='GET') return send(200, { landings: listLandings(db) });
      if(path==='/api/landings'&&method==='POST') return send(201, await createOrUpdateLiveLanding(db, await readBody(req), user.id));
      const deleteLandingMatch = /^\/api\/landings\/([^/]+)$/.exec(path);
      if(deleteLandingMatch&&method==='DELETE') return send(200, deleteLiveLanding(decodeURIComponent(deleteLandingMatch[1])));
      if(path==='/api/facebook/groups'&&method==='GET') return send(200, facebookService.getGroups());
      if(path==='/api/facebook/groups'&&method==='POST') return send(200, facebookService.saveGroups(await readBody(req)));
      if(path==='/api/facebook/cookies-status'&&method==='GET') return send(200, facebookService.getCookieStatus());
      if(path==='/api/facebook/cookies'&&method==='POST') return send(200, facebookService.saveCookies((await readBody(req)).cookies));
      if(path==='/api/facebook/logs'&&method==='GET') return send(200, { logs: facebookService.getLogs() });
      if(path==='/api/facebook/generate-copy'&&method==='POST') return send(200, { copy: facebookService.generateViralCopy(await readBody(req)) });
      if(path==='/api/facebook/publish'&&method==='POST') return send(200, await facebookService.publishToGroup(await readBody(req)));
      fail(404,'Ruta no encontrada');
    } catch(error) {
      if(error instanceof ApiError) return send(error.status,{error:error.message,...(error.attempt_id?{attempt_id:error.attempt_id}:{})});
      if(String(error.message).includes("UNIQUE constraint failed: index 'variant_options'"))return send(409,{error:'Ya existe esta combinación de color, talla y presentación'});
      if(String(error.message).includes('UNIQUE constraint failed: users.email'))return send(409,{error:'Este correo ya tiene un usuario'});
      if(String(error.message).includes('UNIQUE constraint')) return send(409,{error:'SKU o código de plataforma ya registrado'});
      console.error(error);
      send(500,{error:'Error interno. No se guardó la operación.'});
    }
  });
  server.on('close',()=>{saleNotifications.close();dropiWeb.stop();whatsapp.stop();stopPrepared();db.close();});
  return {server,db,whatsapp,restartPrepared};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const dbPath = process.env.NEXORA_DB_PATH ?? process.env.MEIBO_DB_PATH ?? resolve('data/nexora.sqlite');
  const port = Number(process.env.NEXORA_API_PORT ?? process.env.MEIBO_API_PORT ?? 3001);
  const {server,db,whatsapp,restartPrepared}=createApi({dbPath,allowDemo:false});
  whatsapp.start();const stopEvolut=startEvolutWorker(db);server.on('close',stopEvolut);
  const stopWalmart=startWalmartFeedPolling(db);server.on('close',stopWalmart);const stopEnvios=startEnviosUrbanosWorker(db);server.on('close',stopEnvios);restartPrepared();
  server.listen(port,'127.0.0.1',()=>console.log(`Nexora API: http://127.0.0.1:${port} · SQLite local`));
}
