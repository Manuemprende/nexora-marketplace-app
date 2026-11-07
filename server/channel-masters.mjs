import {uuid,now,transaction} from './database.mjs';
import {fail,text,requireVariant,createVariant} from './service.mjs';

// Catalog identity is independent from physical inventory and channel prices.
export function prepareChannelMasters(db,actor){
 return transaction(db,()=>{
  const listings=db.prepare('SELECT * FROM channel_listings WHERE variant_id IS NULL ORDER BY platform,product_ref,variant_ref').all();
  let next=125;for(const row of db.prepare('SELECT meibo_sku FROM variants').all()){const m=/^MEI-(\d+)$/.exec(row.meibo_sku);if(m)next=Math.max(next,Number(m[1])+1);}
  const parents=new Map(db.prepare('SELECT c.platform,c.product_ref,v.product_id FROM channel_listings c JOIN variants v ON v.id=c.variant_id').all().map(r=>[r.platform+':'+r.product_ref,r.product_id]));
  for(const row of listings){
   const key=row.platform+':'+row.product_ref;let parent=parents.get(key);
   if(!parent){parent=uuid();db.prepare('INSERT INTO products(id,name,image_url,is_demo) VALUES (?,?,?,0)').run(parent,row.name,row.image_url);parents.set(key,parent);}
   const id=uuid(),sku='MEI-'+String(next++).padStart(5,'0'),stamp=now();
   db.prepare('INSERT INTO variants(id,product_id,meibo_sku,attributes,presentation,price) VALUES (?,?,?,?,?,0)').run(id,parent,sku,row.attributes,row.attributes);
   db.prepare('INSERT INTO inventory(variant_id,on_hand,stock_confirmed) VALUES (?,0,0)').run(id);
   const codeId=uuid();db.prepare('INSERT INTO external_codes(id,variant_id,platform,code,origin,created_at,price) VALUES (?,?,?,?,?,?,?)').run(codeId,id,row.platform,row.variant_ref||row.product_ref,'Alta catálogo maestro',stamp,row.price);
   if(Number.isSafeInteger(row.published_stock)&&row.published_stock>=0)db.prepare('INSERT INTO platform_stock(code_id,quantity,updated_at,actor_id) VALUES (?,?,?,?)').run(codeId,row.published_stock,row.captured_at,actor);
   db.prepare('INSERT INTO channel_master_origins(variant_id,listing_id,created_at) VALUES (?,?,?)').run(id,row.id,stamp);
   db.prepare('UPDATE channel_listings SET variant_id=?,linked_at=?,linked_by=?,evidence=? WHERE id=?').run(id,stamp,actor,'Alta de identidad MEIBO desde catálogo de origen; equivalencias entre plataformas pendientes',row.id);
   db.prepare('INSERT INTO channel_link_events VALUES (?,?,?,?,?,?)').run(uuid(),row.id,id,actor,'Creación de SKU maestro independiente; stock físico pendiente',stamp);
  }
  return {created:listings.length};
 });
}
function canRetire(db,id){
 const origin=db.prepare('SELECT * FROM channel_master_origins WHERE variant_id=? AND merged_into IS NULL').get(id);
 if(!origin)return false;
 const v=requireVariant(db,id);
 if(!v.active||v.stock||v.reserved||v.stock_confirmed||v.price!==0)return false;
 for(const table of ['inventory_movements','sale_items','order_items','received_returns','platform_stock_events'])if(db.prepare(`SELECT 1 FROM ${table} WHERE variant_id=? LIMIT 1`).get(id))return false;
 if(db.prepare('SELECT 1 FROM variant_policies WHERE variant_id=?').get(id))return false;
 return !db.prepare("SELECT 1 FROM external_codes WHERE variant_id=? AND origin<>'Alta catálogo maestro'").get(id);
}
export function connectChannelMasters(db,input,actor){
 const source=text(input.source_id,'Producto origen',100,true),target=text(input.target_id,'Producto destino',100,true),evidence=text(input.evidence,'Validación',1000,true);
 if(evidence.length<20)fail(400,'Confirma presentación y variante antes de asociar');
 return transaction(db,()=>{
  const a=requireVariant(db,source),b=requireVariant(db,target);
  if(!a.active||!b.active){const prev=db.prepare('SELECT target_id FROM channel_master_events WHERE source_id IN (?,?) AND target_id IN (?,?) LIMIT 1').get(source,target,source,target);if(prev)return {id:prev.target_id,idempotent:true};fail(409,'Uno de los SKU está inactivo; actualiza la vista');}
  if(source===target)return {id:target,idempotent:true};
  let retired=source,kept=target;
  if(!canRetire(db,retired)){if(canRetire(db,target)){retired=target;kept=source;}else fail(409,'Ambos SKU tienen inventario o gestión propia. Requieren conciliación de inventario antes de unirlos.');}
  const listings=db.prepare('SELECT * FROM channel_listings WHERE variant_id IN (?,?)').all(retired,kept);
  if(listings.some(l=>!l.can_associate))fail(409,'Completa las variantes del catálogo de origen antes de asociar');
  const moved=listings.filter(l=>l.variant_id===retired),stamp=now();
  for(const listing of moved){
   db.prepare('UPDATE channel_listings SET variant_id=?,linked_at=?,linked_by=?,evidence=? WHERE id=?').run(kept,stamp,actor,evidence,listing.id);
   db.prepare('INSERT INTO channel_link_events VALUES (?,?,?,?,?,?)').run(uuid(),listing.id,kept,actor,evidence,stamp);
  }
  for(const code of db.prepare('SELECT * FROM external_codes WHERE variant_id=?').all(retired)){if(db.prepare('SELECT 1 FROM external_codes WHERE variant_id=? AND platform=?').get(kept,code.platform))db.prepare('DELETE FROM external_codes WHERE id=?').run(code.id);else db.prepare('UPDATE external_codes SET variant_id=? WHERE id=?').run(kept,code.id);}
  db.prepare('UPDATE variants SET active=0 WHERE id=?').run(retired);
  db.prepare('UPDATE channel_master_origins SET merged_into=? WHERE variant_id=?').run(kept,retired);
  db.prepare('INSERT INTO channel_master_events VALUES (?,?,?,?,?,?)').run(uuid(),retired,kept,actor,evidence,stamp);
  const image=db.prepare('SELECT image_url FROM products WHERE id=(SELECT product_id FROM variants WHERE id=?)').get(kept);
  if(!image.image_url){const candidate=db.prepare('SELECT image_url FROM products WHERE id=(SELECT product_id FROM variants WHERE id=?)').get(retired);if(candidate.image_url)db.prepare('UPDATE products SET image_url=? WHERE id=(SELECT product_id FROM variants WHERE id=?)').run(candidate.image_url,kept);}
  return {id:kept,retired_id:retired,moved:moved.length};
 });
}
export function addChannelVariant(db,id,input,actor){
 const parent=requireVariant(db,id);
 if(!parent.active)fail(409,'Producto inactivo');
 const presentation=text(input.presentation??'','Presentación',200),color=text(input.color??'','Color',80),size=text(input.size??'','Talla',80);
 if(![presentation,color,size].some(Boolean))fail(400,'Indica color, talla o presentación de la nueva variante');
 return createVariant(db,{product_id:parent.product_id,presentation,color,size,price:input.price??0,stock:0,stock_confirmed:false,is_demo:false,reason:'Nueva variante desde mapeo; stock físico pendiente'},actor);
}
