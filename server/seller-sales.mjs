import {fail} from './service.mjs';
const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago'}).format(new Date(value));
export function sellerSales(db,{from,to,seller=''}={}){
 const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(from)||!valid(to)||from>to)fail(400,'Selecciona un rango de fechas válido');
 const sellers=db.prepare('SELECT id,email,active FROM users WHERE id IN (SELECT DISTINCT actor_id FROM sales) ORDER BY email').all();
 const grouped=new Map();
 const rows=db.prepare("SELECT s.actor_id,s.created_at,s.total,u.email,(SELECT COALESCE(SUM(qty),0) FROM sale_items WHERE sale_id=s.id) units FROM sales s JOIN users u ON u.id=s.actor_id WHERE COALESCE(s.status,'registered')<>'cancelled'" ).all();
 for(const row of rows){const date=day(row.created_at);if(date<from||date>to||seller&&row.actor_id!==seller)continue;const value=grouped.get(row.actor_id)??{id:row.actor_id,email:row.email,sales:0,units:0,total:0};value.sales++;value.units+=row.units;value.total+=row.total;grouped.set(row.actor_id,value);}
 const result=[...grouped.values()].sort((a,b)=>b.total-a.total||a.email.localeCompare(b.email));
 return {from,to,sellers,rows:result,totals:result.reduce((a,r)=>({sales:a.sales+r.sales,units:a.units+r.units,total:a.total+r.total}),{sales:0,units:0,total:0})};
}
