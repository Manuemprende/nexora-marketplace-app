import {transaction,uuid,now} from './database.mjs';
import {record,requireVariant,fail} from './service.mjs';

// Explicit maintenance only: retire an unused synthetic test allocation, never real stock.
function disposableTrial(db,id){
 const v=requireVariant(db,id);if(!v.active||v.reserved||v.price!==0)return false;
 if(!db.prepare('SELECT 1 FROM channel_master_origins WHERE variant_id=? AND merged_into IS NULL').get(id))return false;
 for(const t of ['sale_items','order_items','received_returns','platform_stock_events','variant_policies'])if(db.prepare('SELECT 1 FROM '+t+' WHERE variant_id=?').get(id))return false;
 if(db.prepare("SELECT 1 FROM external_codes WHERE variant_id=? AND origin<>'Alta catálogo maestro'").get(id))return false;
 const moves=db.prepare('SELECT * FROM inventory_movements WHERE variant_id=?').all(id);
 if(!moves.length)return v.stock===0&&!v.stock_confirmed;
 return moves.length===1&&moves[0].reference_id==='TEST-STOCK-20261027'&&moves[0].reason.includes('Stock TEMPORAL para pruebas')&&moves[0].before_qty===0&&moves[0].after_qty===100&&v.stock===100&&v.reserved===0;
}
export function reconcileTrialPair(db,pair,actor){
 if(!db.prepare("SELECT 1 FROM users WHERE id=? AND active=1 AND role='admin'").get(actor))fail(403,'Administrador requerido');
 return transaction(db,()=>{
  const a=db.prepare('SELECT * FROM channel_listings WHERE id=?').get(pair.a),b=db.prepare('SELECT * FROM channel_listings WHERE id=?').get(pair.b);
  if(!a||!b||a.name!==pair.a_name||b.name!==pair.b_name||a.image_url!==pair.a_image||b.image_url!==pair.b_image||!a.can_associate||!b.can_associate)fail(409,'La ficha cambió desde la revisión');
  if(pair.rule!=='compatible_unique_name_same_image'||!Number.isFinite(pair.mae)||pair.mae<0||pair.mae>3||!a.image_url||!b.image_url||typeof pair.evidence!=='string'||pair.evidence.length<30)fail(409,'Falta evidencia revisada de producto y presentación');
  if(a.variant_id===b.variant_id)return {status:'already_linked',id:a.variant_id};
  let kept=a.variant_id,retired=b.variant_id;
  if(!disposableTrial(db,retired)){if(disposableTrial(db,kept)){[kept,retired]=[retired,kept];}else fail(409,'Ambas fichas tienen operaciones reales o inventario distinto del lote temporal');}
  const listings=db.prepare('SELECT * FROM channel_listings WHERE variant_id IN (?,?)').all(kept,retired);
  if(listings.some(l=>!l.can_associate))fail(409,'Variante pendiente de identificar');
  const channels=new Set(listings.filter(l=>l.variant_id===kept).map(l=>l.platform));
  if(listings.some(l=>l.variant_id===retired&&channels.has(l.platform)))fail(409,'Las fichas comparten plataforma; revisar publicaciones');
  const codes=db.prepare('SELECT * FROM external_codes WHERE variant_id=?').all(retired);
  if(codes.some(c=>db.prepare('SELECT 1 FROM external_codes WHERE variant_id=? AND platform=?').get(kept,c.platform)))fail(409,'Código de canal superpuesto');
  const v=requireVariant(db,retired),stamp=now(),evidence=pair.evidence+' Conciliación autorizada del lote temporal TEST-STOCK-20261027; se elimina solo la asignación sintética duplicada, sin sumar inventarios.';
  if(v.stock)record(db,retired,'adjustment',v.stock,0,'Retiro de stock TEMPORAL duplicado al asociar catálogos. No es una venta ni una salida física.',actor,'TRIAL-ASSOCIATION:'+retired);
  db.prepare('UPDATE inventory SET stock_confirmed=0 WHERE variant_id=?').run(retired);
  for(const l of listings.filter(l=>l.variant_id===retired)){
   db.prepare('UPDATE channel_listings SET variant_id=?,linked_at=?,linked_by=?,evidence=? WHERE id=?').run(kept,stamp,actor,evidence,l.id);
   db.prepare('INSERT INTO channel_link_events VALUES (?,?,?,?,?,?)').run(uuid(),l.id,kept,actor,evidence,stamp);
  }
  for(const c of codes)db.prepare('UPDATE external_codes SET variant_id=? WHERE id=?').run(kept,c.id);
  db.prepare('UPDATE variants SET active=0 WHERE id=?').run(retired);
  db.prepare('UPDATE channel_master_origins SET merged_into=? WHERE variant_id=?').run(kept,retired);
  db.prepare('INSERT INTO channel_master_events VALUES (?,?,?,?,?,?)').run(uuid(),retired,kept,actor,evidence,stamp);
  return {status:'merged',id:kept,retired_id:retired,trial_units_removed:v.stock};
 });
}
