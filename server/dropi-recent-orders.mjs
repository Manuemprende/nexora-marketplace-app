// Recent-order visibility only. Never creates guides, operational orders or stock movements.
import {saveDropiOrderPreview} from './dropi-order-preview.mjs';

export function csv(line){
 const out=[];let value='',quoted=false;
 for(let n=0;n<line.length;n++){const c=line[n];if(c==='"'){if(quoted&&line[n+1]==='"'){value+='"';n++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(value.trim());value='';}else value+=c;}
 if(quoted)throw Error('Detalle Dropi con texto incompleto');out.push(value.trim());return out;
}
export function mcpTable(result,name){
 if(result?.isError){const message=(result.content??[]).filter(c=>c.type==='text').map(c=>c.text).join(' ');throw Error(/\b404\b/.test(message)?'Dropi lista este pedido, pero no encuentra su detalle (404). El registro se conserva.':'Dropi no confirmó la consulta MCP');}
 const text=(result?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'),lines=text.split(/\r?\n/),at=lines.findIndex(l=>l.startsWith(name+'[')),expanded=lines[at]?.match(/^[a-z_]+\[(\d+)\]:$/);
 if(expanded){
  const count=Number(expanded[1]);if(count>100)throw Error('Listado MCP demasiado grande');const result=[];let current;
  for(const line of lines.slice(at+1)){if(!line.trim())continue;if(!/^\s/.test(line))break;const first=line.match(/^  - ([a-z_]+):\s*(.*)$/),field=first??line.match(/^    ([a-z_]+):\s*(.*)$/);if(!field)throw Error('Listado MCP con estructura no reconocida');if(first){current={};result.push(current);}if(!current)throw Error('Listado MCP incompleto');let value=field[2];try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object')throw Error('nested');value=parsed==null?'':String(parsed);}catch{if(value.startsWith('{')||value.startsWith('['))throw Error('Valor MCP anidado no admitido');}current[field[1]]=value;}
  if(result.length!==count)throw Error('Listado MCP incompleto');return result;
 }
 const header=lines[at]?.match(/^[a-z_]+\[(\d+)\]\{([^}]+)\}:$/);
 if(!header||Number(header[1])>100)throw Error('Formato MCP no reconocido');const keys=header[2].split(','),rows=lines.slice(at+1,at+1+Number(header[1]));if(rows.length!==Number(header[1]))throw Error('Listado MCP incompleto');
 return rows.map(l=>{const values=csv(l.trim());if(values.length!==keys.length)throw Error('Columnas MCP incompletas');return Object.fromEntries(keys.map((k,n)=>[k,values[n]]));});
}
export async function syncMcpRecentDropi(db,{listing,rows:providedRows,detail,actor,maxNew=10,onProcessed,concurrency=1,preserveInputOrder=false}){
 const rows=providedRows??mcpTable(listing,'items'),byId=new Map();for(const row of rows){if(!/^\d+$/.test(row.order_id))throw Error('ID de pedido MCP inválido');byId.set(row.order_id,row);}
 const recent=preserveInputOrder?[...byId.values()]:[...byId.values()].sort((a,b)=>Number(b.order_id)-Number(a.order_id)).sort((a,b)=>{
  const time=o=>db.prepare("SELECT captured_at FROM external_order_previews WHERE platform='Dropi' AND external_id=?").get(o.order_id)?.captured_at??'';return time(a).localeCompare(time(b))||Number(b.order_id)-Number(a.order_id);
 }),saved=[],errors=[];
 async function processRow(row){try{
  const raw=await detail(row.order_id),table=mcpTable(raw,'items');
  const data=(raw.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
  const scalar=key=>{const value=data.split(/\r?\n/).find(l=>l.startsWith(key+':'))?.slice(key.length+1).trim();if(!value)return '';try{const parsed=JSON.parse(value);return parsed==null?'':String(parsed);}catch{return value;}};
  if(scalar('order_id')!==row.order_id)throw Error('Detalle MCP de otro pedido');if(scalar('currency')!=='CLP')throw Error('El pedido no corresponde a moneda CLP');
  const lines=table.map(i=>({product_id:i.product_id,product_name:i.product_name,qty:Number(i.qty),unit_price:i.unit_price,subtotal:i.subtotal}));
  const customerField=key=>{const value=data.split(/\r?\n/).find(l=>new RegExp('^  '+key+':').test(l))?.replace(new RegExp('^  '+key+':\\s*'),'')??'';try{const parsed=JSON.parse(value);return parsed==null?'':String(parsed);}catch{return value;}};
  saveDropiOrderPreview(db,{order_id:row.order_id,status:scalar('status'),created_at:scalar('created_at')||row.created_at,customer:{name:customerField('name')||row.customer_name,phone:customerField('phone')||row.customer_phone,address:customerField('address'),city:customerField('city')||row.city},items:lines,total:Number(scalar('total')),currency:scalar('currency')||'CLP',shipping_company:row.shipping_company,tracking_code:scalar('tracking_code'),rate_type:row.rate_type},actor);saved.push(row.order_id);onProcessed?.(row.order_id,null);
 }catch(e){errors.push({id:row.order_id,message:e.message});onProcessed?.(row.order_id,e.message);}}
 const batch=recent.slice(0,maxNew);let cursor=0;await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),2,batch.length)},async()=>{while(cursor<batch.length){const row=batch[cursor++];await processRow(row);}}));
 return {saved:saved.length,new_detail_requests:Math.min(recent.length,maxNew),ids:saved,errors,recent_limit:null,operational_orders_created:0};
}
export function dropiMcpItems(result,order){
 if(result?.isError)throw Error('Dropi no confirmó el detalle');
 const text=(result?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'),lines=text.split(/\r?\n/);
 const identity=lines.find(l=>/^order_id:/.test(l))?.slice(9).trim().replace(/^"|"$/g,'');
 if(identity!==String(order.id))throw Error('El detalle no corresponde al pedido Dropi');
 const at=lines.findIndex(l=>/^items\[\d+\]\{/.test(l)),header=at>=0?lines[at].match(/^items\[(\d+)\]\{([^}]+)\}:$/):null;
 if(!header||Number(header[1])<1||Number(header[1])>100)throw Error('Detalle Dropi sin cantidades verificables');
 const keys=header[2].split(','),rows=lines.slice(at+1,at+1+Number(header[1]));
 if(rows.length!==Number(header[1]))throw Error('Líneas Dropi incompletas');
 return rows.map(line=>{
  const values=csv(line.trim());if(values.length!==keys.length)throw Error('Formato de líneas Dropi cambió');
  const item=Object.fromEntries(keys.map((key,n)=>[key,values[n]])),product=String(item.product_id),qty=Number(item.qty);
  if(!/^\d+$/.test(product)||!Number.isSafeInteger(qty)||qty<1)throw Error('Cantidad Dropi inválida');
  const matches=(order.orderdetails??[]).filter(d=>String(d.product_id)===product);
  if(matches.length!==1)throw Error('Producto o variante Dropi ambiguos');
  return {product_id:product,product_name:item.product_name,qty,variant_id:matches[0].variation_id??null,unit_price:item.unit_price??null,subtotal:item.subtotal??null};
 });
}
export function recentDropiRows(rows,{supplierId,limit=30}={}){
 if(!Array.isArray(rows))throw Error('Listado Dropi inválido');
 const seen=new Map();
 for(const row of rows){if(!/^\d+$/.test(String(row.id))||String(row.supplier_id)!==String(supplierId))throw Error('Pedido Dropi fuera del proveedor esperado');seen.set(String(row.id),row);}
 return [...seen.values()].sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,limit);
}
export async function syncRecentDropiPreviews(db,{rows,supplierId,detail,actor,maxNew=10}){
 const selected=recentDropiRows(rows,{supplierId}).sort((a,b)=>{
  const time=o=>db.prepare("SELECT captured_at FROM external_order_previews WHERE platform='Dropi' AND external_id=?").get(String(o.id))?.captured_at??'';
  return time(a).localeCompare(time(b))||Number(b.id)-Number(a.id);
 }),saved=[],errors=[];let newRequests=0;
 for(const order of selected){
  try{
   if(newRequests>=maxNew)continue;newRequests++;
   const items=dropiMcpItems(await detail(String(order.id)),order);
   const city=typeof order.city==='string'?order.city:order.city?.name??'';
   saveDropiOrderPreview(db,{order_id:String(order.id),status:order.status,created_at:order.created_at,customer:{name:[order.name,order.surname].filter(Boolean).join(' '),phone:String(order.phone??''),address:order.dir??'',city},items,total:Number(order.total_order),currency:'CLP',shipping_company:order.shipping_company,tracking_code:String(order.shipping_guide??''),rate_type:order.rate_type},actor);
   saved.push(String(order.id));
  }catch(e){errors.push({id:String(order.id),message:e.message});}
 }
 return {saved:saved.length,new_detail_requests:newRequests,ids:saved,errors,recent_limit:30,operational_orders_created:0};
}
