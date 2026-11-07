import {fail} from './service.mjs';
export function canManageAllSales(user){return user.role==='admin'||user.permissions?.includes('cash');}
export function requireSaleAccess(db,user,id){
 if(canManageAllSales(user))return;
 const row=db.prepare('SELECT actor_id FROM sales WHERE id=?').get(id);if(!row)fail(404,'Venta no encontrada');
 if(row.actor_id!==user.id)fail(403,'Solo puedes consultar o gestionar tus propias ventas');
}
