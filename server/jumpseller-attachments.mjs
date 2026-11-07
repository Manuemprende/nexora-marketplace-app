import {createHash} from 'node:crypto';
import {now} from './database.mjs';
import {fail} from './service.mjs';
export function orderLabelAttachments(order){
 const found=[];
 for(const product of order.products??[])for(const file of product.files??[]){
  if(!/etiqueta|shipping label/i.test(file.option??''))continue;
  let url;try{url=new URL(file.url);}catch{continue;}
  if(url.protocol!=='https:'||!/^jumpseller(?:-private)?\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname)||!url.pathname.toLowerCase().endsWith('.pdf'))continue;
  const key='attachment:'+order.id+':'+createHash('sha256').update(url.pathname).digest('hex');
  if(found.some(x=>x.key===key))continue;
  found.push({key,product_id:product.id,option:String(file.option).slice(0,150),carrier:/mercado.?libre|mercado.?env/i.test(product.name??'')?'Mercado Envíos':'Etiqueta adjunta'});
 }
 return found;
}
export async function attachedOrderLabel(db,orderId,source){
 const attachments=orderLabelAttachments(source);if(!attachments.length)fail(409,'El pedido no tiene una etiqueta PDF adjunta');if(attachments.length>1)fail(409,'El pedido tiene varias etiquetas adjuntas; requiere seleccionar el documento');
 const selected=attachments[0],cached=db.prepare('SELECT content FROM order_shipping_labels WHERE fulfillment_id=? AND order_id=?').get(selected.key,orderId);if(cached)return Buffer.from(cached.content);
 let target;
 for(const product of source.products??[])for(const file of product.files??[]){try{const u=new URL(file.url);if('attachment:'+source.id+':'+createHash('sha256').update(u.pathname).digest('hex')===selected.key)target=u;}catch{}}
 if(!target||target.protocol!=='https:'||!/^jumpseller(?:-private)?\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(target.hostname))fail(409,'Origen de etiqueta no válido');
 const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)fail(409,'No se pudo descargar la etiqueta adjunta. Vuelve a consultar el pedido');
 const reader=response.body.getReader(),chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10000000){await reader.cancel();fail(413,'Etiqueta demasiado grande');}chunks.push(value);}
 const bytes=Buffer.concat(chunks);if(bytes.subarray(0,5).toString()!=='%PDF-')fail(409,'El archivo adjunto no es un PDF válido');
 db.prepare('INSERT INTO order_shipping_labels VALUES (?,?,?,?) ON CONFLICT(fulfillment_id) DO UPDATE SET content=excluded.content,captured_at=excluded.captured_at').run(selected.key,orderId,bytes,now());return bytes;
}
