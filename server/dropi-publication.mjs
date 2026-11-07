import {createHash} from 'node:crypto';
import {normalizeDropiFields} from './dropi-publication-fields.mjs';
import {createDropiWebConnector} from './dropi-web.mjs';
import {DropiClient,normalizeName} from './dropi.mjs';
import {fail} from './service.mjs';
import {now} from './database.mjs';

export function validateDropiPublication(p,d,link){
 if(link)fail(409,'Este producto ya está asociado a Dropi. No se creará otro; la actualización de fichas existentes requiere validación.');
 if(p.color||p.size)fail(409,'La publicación de variantes en Dropi todavía requiere validación.');
 if(!d.name?.trim()||d.name.trim().length>40)fail(400,'Dropi: el nombre debe tener entre 1 y 40 caracteres.');
 if((d.description??'').trim().length<200)fail(400,'Dropi: completa al menos 200 caracteres de descripción.');
 if(!Number.isSafeInteger(Number(d.category_id))||Number(d.category_id)<1)fail(400,'Dropi: indica una categoría válida.');
 if(!Number.isSafeInteger(d.price)||d.price<=0||!Number.isSafeInteger(d.recommended_price)||d.recommended_price<=0)fail(400,'Dropi: indica el precio proveedor y el precio recomendado.');
 if(!Number.isSafeInteger(d.stock)||d.stock<100)fail(400,'Dropi: una publicación pública nueva requiere al menos 100 unidades en una bodega.');
 let fields;try{fields=normalizeDropiFields(d.dropi);}catch(e){fail(400,e.message);}
 for(const [key,label] of [['weight_g','peso'],['length_cm','largo'],['width_cm','ancho'],['height_cm','alto'],['warehouse_id','bodega']])if(!fields[key])fail(400,'Dropi: falta '+label+'.');
 const images=[...new Set([d.image_url,...fields.images].filter(Boolean))];
 if(images.length<3)fail(400,'Dropi: agrega al menos tres fotografías distintas.');
 return {...fields,images};
}

async function photo(db,url,fetchImpl){
 const local=/^\/api\/images\/([a-f0-9-]{36})\.webp$/.exec(url);
 let bytes,type;
 if(local){const row=db.prepare('SELECT content FROM product_images WHERE id=?').get(local[1]);if(!row)fail(400,'Dropi: fotografía no encontrada en MEIBO.');bytes=Buffer.from(row.content);type='image/webp';}
 else{
  let u;try{u=new URL(url);}catch{fail(400,'Dropi: fotografía inválida.');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['cdnx.jumpseller.com','images.jumpseller.com','d39ru7awumhhs2.cloudfront.net'].includes(u.hostname)&&!u.hostname.endsWith('.storage.supabase.co')&&!(u.origin===process.env.MEIBO_PUBLIC_URL?.replace(/\/$/,'')&&u.pathname.startsWith('/api/public-product-images/')))fail(400,'Dropi: sube las fotografías a MEIBO o utiliza imágenes de un catálogo conectado.');
  const r=await fetchImpl(u.href,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)fail(400,'Dropi: no se pudo descargar una fotografía.');type=(r.headers.get('content-type')??'').split(';')[0];
  if(!['image/jpeg','image/png','image/webp'].includes(type))fail(400,'Dropi: usa fotografías JPG, PNG o WebP.');
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>12*1024*1024)fail(400,'Dropi: una fotografía supera 12 MB.');chunks.push(chunk);}bytes=Buffer.concat(chunks);
 }
 if(!bytes.length||bytes.length>12*1024*1024)fail(400,'Dropi: tamaño de fotografía inválido.');
 return {bytes,type};
}

// Explicit sends only. No timer, automatic fallback, or retry of an uncertain create.
export async function publishDropi(db,{p,d,row,link,record,fetchImpl=fetch,session:providedSession}){
 const fields=validateDropiPublication(p,d,link);
 if(db.prepare('SELECT count(*) n FROM variants WHERE product_id=? AND active=1').get(p.product_id).n>1)fail(409,'Dropi: este producto tiene variantes; revisa su presentación antes de publicar.');
 if(row.remote_id)fail(409,'Dropi: ya hay un ID remoto. Verifica el producto antes de repetir.');
 const connector=providedSession?null:createDropiWebConnector(db);let session;
 try{session=providedSession??await connector.privateSession();}finally{connector?.stop();}
 const client=new DropiClient({...session,fetchImpl});
 const search=await client.request(`/bff/catalog/products/produit/${session.user.id}/owner`,{keywords:d.name,pageSize:100,page:1,warehouse_id:null,get_stock:false,user_id:session.user.id});
 if(!Array.isArray(search.record)||!Number.isSafeInteger(search.count_record)||search.count_record>search.record.length)fail(409,'Dropi: no se pudo completar la comprobación de duplicados.');
 if(search.record.some(r=>normalizeName(r.name)===normalizeName(d.name)||r.sku===p.sku))fail(409,'Dropi: el producto ya existe. Usa Revisar asociación antes de publicar.');
 const photos=[];for(const url of fields.images)photos.push(await photo(db,url,fetchImpl));
 if(new Set(photos.map(i=>createHash('sha256').update(i.bytes).digest('hex'))).size<3)fail(400,'Dropi: las tres fotografías deben ser diferentes, no copias del mismo archivo.');
 const body={user_id:session.user.id,id:null,name:d.name.trim(),description:d.description,type:'SIMPLE',sale_price:d.price,suggested_price:d.recommended_price,privated_product:false,active:true,sku:p.sku,weight:fields.weight_g,length:fields.length_cm,width:fields.width_cm,height:fields.height_cm,attribute:[],variations:[],categories:[{id:Number(d.category_id)}],dropi_app_description:'',add_stock_in_return:true,private_product_inventories:[],user_profit_percentage_product:[],is_warehouse_white_brand:false,warehouselected:[{warehouse_id:fields.warehouse_id,stock:d.stock,warehouse_white_brand:false}],name_in_guide:'',shipping_method:null,bar_code:''};
 if(!db.prepare("UPDATE publication_drafts SET status='sending',error='' WHERE variant_id=? AND platform='Dropi' AND status IN ('draft','error') AND updated_at=?").run(p.id,row.updated_at).changes)fail(409,'El envío ya comenzó.');
 const headers={'X-Authorization':'Bearer '+session.token,Accept:'application/json',Origin:'https://app.dropi.cl',Referer:'https://app.dropi.cl/'};
 let phase='creación del producto';
 try{
  const r=await fetchImpl('https://api.dropi.cl/api/products',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!r.ok){const state=r.status<500&&![408,409,429].includes(r.status)?'error':'uncertain';const message='Dropi HTTP '+r.status+(r.status===403?' · La cuenta o la protección de Dropi rechazó la publicación. Revisa el acceso de creación.':' · No se confirmó la creación.');db.prepare("UPDATE publication_drafts SET status=?,error=?,updated_at=? WHERE variant_id=? AND platform='Dropi'").run(state,message,now(),p.id);fail(409,message);}
  const result=await r.json(),id=result.objects?.id;
  if(!Number.isSafeInteger(Number(id))||Number(id)<=0||result.isSuccess!==true)throw Error('Dropi no confirmó un identificador de producto.');
  db.prepare("UPDATE publication_drafts SET remote_id=? WHERE variant_id=? AND platform='Dropi'").run(String(id),p.id);
  phase='carga de fotografías del producto '+id;
  for(let index=0;index<photos.length;index++){
   const image=photos[index],form=new FormData();form.append('files',new Blob([image.bytes],{type:image.type}),'meibo-'+index+(image.type==='image/jpeg'?'.jpg':image.type==='image/png'?'.png':'.webp'));form.append('id',String(id));form.append('main',index===0?'true':'false');
   const response=await fetchImpl('https://api.dropi.cl/api/products/photos/upload',{method:'POST',headers,body:form,redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error('Dropi HTTP '+response.status+' al cargar fotografía '+(index+1));const imageResult=await response.json();if(imageResult.isSuccess!==true)throw Error('Dropi no confirmó la fotografía '+(index+1));
  }
  phase='verificación del producto '+id;
  const confirmed=await client.request(`/bff/catalog/products/produit/${session.user.id}/owner`,{keywords:String(id),pageSize:100,page:1,warehouse_id:null,get_stock:false,user_id:session.user.id});
  const item=confirmed.record?.find(i=>String(i.id)===String(id));if(!item||item.sale_price!==d.price||item.total_stock!==d.stock||!Array.isArray(item.gallery)||item.gallery.length<photos.length)throw Error('Dropi no confirmó precio, stock y todas las fotografías.');
  record(db,p,'Dropi',null,d,{data:{id}},String(id));db.prepare("UPDATE publication_drafts SET status='received',error='',updated_at=? WHERE variant_id=? AND platform='Dropi'").run(now(),p.id);
  return {http_status:r.status,message:'Producto y fotografías confirmados en Dropi'};
 }catch(e){const message=('Verifica '+phase+' en Dropi antes de repetir. '+e.message).slice(0,900);db.prepare("UPDATE publication_drafts SET status='uncertain',error=?,updated_at=? WHERE variant_id=? AND platform='Dropi' AND status='sending'").run(message,now(),p.id);throw e;}
}
