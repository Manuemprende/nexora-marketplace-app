import {createHash} from 'node:crypto';
import {fail} from './service.mjs';

export const notificationPath='/api/integrations/mercadolibre/notifications';
// Notifications are untrusted hints. Never change stock or orders from this payload.
// A future worker must fetch and verify each resource with the seller's API token.
export function receiveNotification(db,input,clientId=process.env.MELI_CLIENT_ID){
 const {application_id,user_id,topic,resource}=input;
 if(!/^\d+$/.test(String(application_id))||!/^\d+$/.test(String(user_id))||
    typeof topic!=='string'||!topic||topic.length>100||
    typeof resource!=='string'||resource.length>1500||
    !/^\/?[a-zA-Z0-9][a-zA-Z0-9_./?=&%-]*$/.test(resource)||resource.includes('..')||resource.includes('://'))fail(400,'Notificación inválida');
 if(!clientId||String(application_id)!==String(clientId)||!db.prepare('SELECT seller_id FROM mercadolibre_connections WHERE seller_id=?').get(String(user_id)))return {accepted:false};
 const id=createHash('sha256').update(JSON.stringify([String(application_id),String(user_id),topic,resource,input.sent??input.received??null])).digest('hex');
 if(db.prepare('SELECT id FROM mercadolibre_notifications WHERE id=?').get(id))return {accepted:true};
 if(db.prepare("SELECT count(*) AS n FROM mercadolibre_notifications WHERE status='pending'").get().n>=10000)fail(503,'Cola de notificaciones llena');
 db.prepare('INSERT INTO mercadolibre_notifications(id,seller_id,topic,resource,payload,received_at) VALUES (?,?,?,?,?,?)').run(id,String(user_id),topic,resource,JSON.stringify(input),new Date().toISOString());
 return {accepted:true};
}
