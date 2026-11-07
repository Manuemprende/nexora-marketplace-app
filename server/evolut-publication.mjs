import {fail} from './service.mjs';
import {now} from './database.mjs';
export async function publishEvolut(db,{p,d,link,row,token,record}){
 if(!token)fail(409,'Falta configurar el token de proveedor Evolut');
 if(d.image_url&&!/^https:\/\//.test(d.image_url))fail(400,'Evolut necesita un enlace público HTTPS para la imagen');
 const headers={Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token};
 const endpoint='https://evolut.cl/api/supplier/catalog/products';
 const get=async()=>{const r=await fetch(endpoint+'/'+encodeURIComponent(link.product_ref),{headers,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)fail(409,'No se pudo leer el producto de Evolut antes de actualizar');const current=(await r.json()).data;if(!current||String(current.id)!==String(link.product_ref)||!Array.isArray(current.variants))fail(409,'La respuesta de Evolut no permite conservar las variantes con seguridad');return current;};
 const current=link?await get():null;
 if(!link&&(p.color||p.size||db.prepare('SELECT count(*) n FROM variants WHERE product_id=? AND active=1').get(p.product_id).n>1))fail(409,'El documento no detalla los campos internos de variants. La creación de variantes requiere ese esquema; los productos simples ya pueden publicarse.');
 let variants;
 if(current){
  variants=current.variants.map(v=>({...v}));
  if(variants.some(v=>!v.id)||new Set(variants.map(v=>String(v.id))).size!==variants.length)fail(409,'Faltan IDs únicos para conservar todas las variantes de Evolut');
  if(link.variant_ref){const selected=variants.find(v=>String(v.id)===String(link.variant_ref));if(!selected)fail(409,'La variante asociada ya no existe en Evolut');selected.price=d.price;}
  else if(variants.length)fail(409,'El producto tiene variantes. Asocia el ID de la variante concreta antes de cambiar su precio.');
 }
 const body={name:d.name,description:d.description,price:link?.variant_ref?current.price:d.price,...(!link?{sku:p.sku,is_active:true}:{}),...(d.category_id?{category_id:d.category_id}:{}),...(current?{variants}:{}),...(d.image_url?{images:[...new Set([...(Array.isArray(current?.images)?current.images:[]),d.image_url])]}:{})};
 // Read twice before replacing the variant list. Refuse changes made during preparation.
 if(current){const latest=await get();if(JSON.stringify(latest)!==JSON.stringify(current))fail(409,'El producto cambió en Evolut. Vuelve a revisar antes de enviar.');}
 if(!db.prepare("UPDATE publication_drafts SET status='sending',error='' WHERE variant_id=? AND platform='Evolut' AND status IN ('draft','error') AND updated_at=?").run(p.id,row.updated_at).changes)fail(409,'El envío ya comenzó');
 let phase='producto';
 try{
  const response=await fetch(endpoint+(link?'/'+encodeURIComponent(link.product_ref):''),{method:link?'PUT':'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});
  const result=await response.json();if(!response.ok){const fields=result.errors&&typeof result.errors==='object'?Object.entries(result.errors).map(([k,v])=>k+': '+(Array.isArray(v)?v.join(', '):v)).join('; '):result.message||'Revisa los datos';const message=('Evolut HTTP '+response.status+' · '+fields).slice(0,800);db.prepare("UPDATE publication_drafts SET status=?,error=?,updated_at=? WHERE variant_id=? AND platform='Evolut'").run(response.status<500?'error':'uncertain',message,now(),p.id);fail(400,message);}
  const product=result.data;if(!product?.id||link&&String(product.id)!==String(link.product_ref))throw Error('Respuesta sin el ID esperado');
  if(current&&variants.some(v=>!product.variants?.some(x=>String(x.id)===String(v.id))))throw Error('La respuesta no confirma todas las variantes; verifica el producto en Evolut');
  record(db,p,'Evolut',link,{...d,stock:product.stock??0},result,String(product.id));
  if(!link&&d.stock>0){phase='stock inicial';const stock=await fetch('https://evolut.cl/api/supplier/inventory/adjust',{method:'POST',headers,body:JSON.stringify({product_id:product.id,mode:'set',quantity:d.stock,reason:'Stock inicial explícito al publicar desde MEIBO'}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!stock.ok)throw Error('Producto creado; no se confirmó el stock inicial');const confirmed=(await stock.json()).data;if(confirmed?.stock!==d.stock)throw Error('Stock inicial no confirmado');db.prepare("UPDATE channel_listings SET published_stock=? WHERE platform='Evolut' AND variant_id=?").run(d.stock,p.id);}
  db.prepare("UPDATE publication_drafts SET status='received',remote_id=?,error='',updated_at=? WHERE variant_id=? AND platform='Evolut'").run(String(product.id),now(),p.id);
  return {http_status:response.status};
 }catch(e){db.prepare("UPDATE publication_drafts SET status='uncertain',error=?,updated_at=? WHERE variant_id=? AND platform='Evolut' AND status='sending'").run('Verifica '+phase+' en Evolut antes de repetir el envío',now(),p.id);throw e;}
}
