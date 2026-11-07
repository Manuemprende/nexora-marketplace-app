import {transaction,now} from './database.mjs';
import {fail} from './service.mjs';
export function demandSettings(db){const r=db.prepare('SELECT * FROM demand_alert_settings WHERE id=1').get();return {...r,enabled:!!r.enabled,stock_mode:'unconfirmed',whatsapp_enabled:false};}
export function saveDemandSettings(db,input,actor){
 if(typeof input.enabled!=='boolean'||![7,14,30].includes(input.window_days)||!Number.isSafeInteger(input.minimum_units)||input.minimum_units<1||input.minimum_units>1000000||!Number.isSafeInteger(input.growth_percent)||input.growth_percent<1||input.growth_percent>10000)fail(400,'Revisa los parámetros de alta demanda');
 return transaction(db,()=>{db.prepare('UPDATE demand_alert_settings SET enabled=?,window_days=?,minimum_units=?,growth_percent=?,updated_at=?,updated_by=? WHERE id=1').run(+input.enabled,input.window_days,input.minimum_units,input.growth_percent,now(),actor);return demandSettings(db);});
}
const dayKey=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const dayNumber=key=>Date.parse(key+'T00:00:00Z')/86400000;
// Complete Chile calendar days: exclude partial today, cancellations, POS-linked orders and review samples.
export function calculateDemand(events,settings,at=Date.now()){
 const today=dayNumber(dayKey(at)),days=settings.window_days,buckets=new Map();let invalidDates=0;
 for(const e of events){
  if(!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(e.created_at??'')||!Number.isFinite(Date.parse(e.created_at))){invalidDates++;continue;}
  const age=today-dayNumber(dayKey(Date.parse(e.created_at)));
  if(age<1||age>days*2||!Number.isSafeInteger(e.qty)||e.qty<1)continue;
  const key=e.variant_id+'|'+e.platform,b=buckets.get(key)??{variant_id:e.variant_id,platform:e.platform,current_units:0,previous_units:0,active_days:new Set()};
  b.active_days.add(age);if(age<=days)b.current_units+=e.qty;else b.previous_units+=e.qty;buckets.set(key,b);
 }
 const rows=[...buckets.values()].filter(b=>b.current_units>=settings.minimum_units&&b.previous_units>0&&((b.current_units-b.previous_units)*100/b.previous_units)>=settings.growth_percent).map(b=>({variant_id:b.variant_id,platform:b.platform,current_units:b.current_units,previous_units:b.previous_units,daily_units:Number((b.current_units/days).toFixed(2)),growth_percent:Number(((b.current_units-b.previous_units)*100/b.previous_units).toFixed(1)),window_days:days,period_end:dayKey(at),key:b.variant_id+'|'+b.platform+'|'+dayKey(at)}));
 return {rows:rows.sort((a,b)=>b.current_units-a.current_units||b.growth_percent-a.growth_percent),invalid_dates:invalidDates};
}
export function demandInbox(db,at=Date.now()){
 const settings=demandSettings(db);if(!settings.enabled)return {settings,rows:[],enabled:false};
 const floor=new Date(at-(settings.window_days*2+3)*86400000).toISOString(),events=db.prepare("SELECT si.variant_id,si.qty,s.created_at,'POS' platform FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' AND s.created_at>=?").all(floor);
 const sourceOrders=db.prepare("SELECT o.id,o.platform,d.payload FROM orders o JOIN external_order_details d ON d.order_id=o.id WHERE o.sale_id IS NULL AND o.platform IN ('Jumpseller','Dropea','Evolut') AND o.status<>'cancelled'").all();
 let skipped=0;
 for(const order of sourceOrders){let source;try{source=JSON.parse(order.payload);}catch{skipped++;continue;}if(/cancel|rechaz|refund|reembols/i.test(String(source.status??source.source_status??'')))continue;
  const date=source.created_at;if(typeof date!=='string'||date<floor){skipped++;continue;}
  for(const line of db.prepare('SELECT variant_id,qty FROM order_items WHERE order_id=?').all(order.id))events.push({...line,created_at:date,platform:order.platform});
 }
 const result=calculateDemand(events,settings,at);
 const variants=new Map(db.prepare('SELECT v.id,v.meibo_sku sku,p.name,p.image_url,v.active FROM variants v JOIN products p ON p.id=v.product_id').all().map(r=>[r.id,r]));
 return {settings,enabled:true,rows:result.rows.filter(r=>variants.get(r.variant_id)?.active).map(r=>({...r,product:variants.get(r.variant_id)})),excluded_dates:result.invalid_dates+skipped,stock_mode:'unconfirmed',note:'Compara pedidos o ventas registrados por canal; los historiales incompletos pueden alterar la comparación. No incluye muestras ni pedidos de prueba de Dropi. No recomienda compras hasta conciliar el inventario.'};
}
