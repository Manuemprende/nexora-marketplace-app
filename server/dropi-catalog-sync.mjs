import {randomUUID} from 'node:crypto';

// This is a read from Dropi: only its published stock and new channel identities change.
export function syncDropiCapture(db,capture,actor,{clock=Date.now}={}){
 const products=capture?.products,stamp=capture?.captured_at;
 if(!capture?.complete||!Array.isArray(products)||!Number.isSafeInteger(capture.expected)||products.length!==capture.expected||!products.length)throw Error('Captura Dropi incompleta');
 if(!Number.isFinite(Date.parse(stamp))||clock()-Date.parse(stamp)>1800000||Date.parse(stamp)>clock()+60000)throw Error('La captura Dropi no es reciente');
 const ids=new Set();
 for(const p of products){if(!Number.isSafeInteger(p.id)||p.id<1||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!['SIMPLE','VARIABLE'].includes(p.type))throw Error('Producto Dropi inválido o repetido');ids.add(p.id);}
 const known=new Map(db.prepare("SELECT * FROM channel_listings WHERE platform='Dropi' AND variant_ref='' ").all().map(r=>[r.product_ref,r]));
 if(known.size&&!products.some(p=>known.has(String(p.id))))throw Error('La captura no coincide con el catálogo Dropi de MEIBO');
 const stats={captured_at:stamp,total:products.length,new:0,stock_updated:0,unchanged:0,unknown_stock:0,variable_products:0,variable_details:0,missing:[...known.keys()].filter(id=>!ids.has(Number(id))),issues:[]};
 let next=125;for(const v of db.prepare('SELECT meibo_sku FROM variants').all()){const m=/^MEI-(\d+)$/.exec(v.meibo_sku);if(m)next=Math.max(next,Number(m[1])+1);}
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const p of products){
   const ref=String(p.id),old=known.get(ref),quantity=Number.isSafeInteger(p.total_stock)&&p.total_stock>=0?p.total_stock:null;
   if(quantity===null){stats.unknown_stock++;stats.issues.push({id:ref,reason:'Stock ausente o negativo; requiere revisión'});}
   if(p.type==='VARIABLE'){stats.variable_products++;const variants=new Set((p.variation_warehouses??[]).map(w=>w.variation_id).filter(Number.isSafeInteger));stats.variable_details+=variants.size;}
   const remoteStatus=(p.active?'Activo':'Inactivo')+(quantity===null?' · Stock por revisar':'');
   if(old){
    // Do not overwrite names, confirmed links, channel prices, or the physical stock.
    db.prepare("UPDATE channel_listings SET published_stock=?,remote_status=?,captured_at=? WHERE id=?").run(quantity,remoteStatus,stamp,old.id);
    if(old.published_stock!==quantity)stats.stock_updated++;else stats.unchanged++;
    if(old.variant_id){const others=db.prepare("SELECT count(*) n FROM channel_listings WHERE platform='Dropi' AND variant_id=?").get(old.variant_id).n;
     if(others===1){const code=db.prepare("SELECT id FROM external_codes WHERE platform='Dropi' AND variant_id=? AND code=?").get(old.variant_id,ref);
      if(code&&quantity!==null)db.prepare('INSERT INTO platform_stock(code_id,quantity,updated_at,actor_id) VALUES (?,?,?,?) ON CONFLICT(code_id) DO UPDATE SET quantity=excluded.quantity,updated_at=excluded.updated_at,actor_id=excluded.actor_id').run(code.id,quantity,stamp,actor);
     }
    }
    continue;
   }
   if(!Number.isSafeInteger(p.sale_price)||p.sale_price<0)throw Error('Precio Dropi inválido para producto nuevo '+ref);
   const image=p.gallery?.find(x=>x.main)??p.gallery?.[0],imageUrl=image?.urlS3?'https://d39ru7awumhhs2.cloudfront.net/'+image.urlS3:image?.url??'',listing='Dropi:p:'+ref;
   const parent=randomUUID(),variant=randomUUID(),code=randomUUID(),sku='MEI-'+String(next++).padStart(5,'0'),attributes=p.type==='SIMPLE'?'Presentación simple':'Producto con variantes · atributos pendientes';
   db.prepare('INSERT INTO products(id,name,image_url,is_demo) VALUES (?,?,?,0)').run(parent,p.name,imageUrl);
   db.prepare('INSERT INTO variants(id,product_id,meibo_sku,attributes,presentation,price) VALUES (?,?,?,?,?,0)').run(variant,parent,sku,attributes,attributes);
   db.prepare('INSERT INTO inventory(variant_id,on_hand,stock_confirmed) VALUES (?,0,0)').run(variant);
   db.prepare("INSERT INTO external_codes(id,variant_id,platform,code,origin,created_at,price) VALUES (?,?,'Dropi',?,'Alta catálogo maestro',?,?)").run(code,variant,ref,stamp,p.sale_price);
   if(quantity!==null)db.prepare('INSERT INTO platform_stock(code_id,quantity,updated_at,actor_id) VALUES (?,?,?,?)').run(code,quantity,stamp,actor);
   db.prepare("INSERT INTO channel_listings(id,platform,product_ref,variant_ref,external_sku,name,attributes,image_url,price,currency,published_stock,remote_status,can_associate,captured_at,variant_id,linked_at,linked_by,evidence) VALUES (?,'Dropi',?,'',?,?,?,?,?,'CLP',?,?,?,?,?,?,?,?)").run(listing,ref,p.sku??'',p.name,attributes,imageUrl,p.sale_price,quantity,remoteStatus,p.type==='SIMPLE'?1:0,stamp,variant,stamp,actor,'Alta de identidad MEIBO desde Dropi; equivalencias pendientes');
   db.prepare('INSERT INTO channel_master_origins(variant_id,listing_id,created_at) VALUES (?,?,?)').run(variant,listing,stamp);
   db.prepare('INSERT INTO channel_link_events VALUES (?,?,?,?,?,?)').run(randomUUID(),listing,variant,actor,'Alta incremental Dropi; stock físico pendiente',stamp);
   stats.new++;
  }
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Referencias de catálogo inválidas');
  db.exec('COMMIT');return stats;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
