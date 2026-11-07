import {transaction} from './database.mjs';
import {catalog,fail} from './service.mjs';
export function featuredProducts(db){return db.prepare('SELECT variant_id FROM pos_featured ORDER BY slot').all().map(r=>r.variant_id);}
export function saveFeaturedProducts(db,input){
 const ids=input.variant_ids;
 if(!Array.isArray(ids)||ids.length>4||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail(400,'Selecciona hasta cuatro productos diferentes');
 const products=catalog(db);
 if(ids.some(id=>!products.some(p=>p.id===id&&p.active&&p.pos_enabled!==false)))fail(400,'Selecciona productos activos disponibles en el punto de venta');
 return transaction(db,()=>{db.prepare('DELETE FROM pos_featured').run();const insert=db.prepare('INSERT INTO pos_featured(slot,variant_id) VALUES (?,?)');ids.forEach((id,i)=>insert.run(i+1,id));return featuredProducts(db);});
}
