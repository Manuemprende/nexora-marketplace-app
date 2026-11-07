import {uuid,now} from './database.mjs';
import {integer,text,operation,fail} from './service.mjs';
export const activeCashSession=db=>db.prepare("SELECT * FROM cash_sessions WHERE status='open'").get()??null;
const balance=(db,s)=>s.opening_balance+db.prepare('SELECT COALESCE(SUM(amount),0) n FROM cash_movements WHERE session_id=?').get(s.id).n;
function current(db,id){const s=activeCashSession(db);if(!s||s.id!==id)fail(409,'La caja está cerrada o cambió. Actualiza el punto de venta');return s;}
function cashSummary(db,s){
 if(s.status==='closed'&&s.closing_summary)return JSON.parse(s.closing_summary);
 const byKind=Object.fromEntries(db.prepare('SELECT kind,SUM(amount) amount FROM cash_movements WHERE session_id=? GROUP BY kind').all(s.id).map(r=>[r.kind,r.amount]));
 const payments={cash:0,card:0,transfer:0},refunds={cash:0,card:0,transfer:0};
 for(const r of db.prepare('SELECT payment_method,SUM(total) amount FROM sales WHERE cash_session_id=? GROUP BY payment_method').all(s.id))payments[r.payment_method]=r.amount;
 for(const r of db.prepare('SELECT method,SUM(amount) amount FROM cash_refunds WHERE session_id=? GROUP BY method').all(s.id))refunds[r.method]=r.amount;
 return {opening_balance:s.opening_balance,expected_cash:balance(db,s),payments,refunds,received:byKind.sale_receipt??0,change:-(byKind.sale_change??0),cash_refunds:-(byKind.refund??0),entries:byKind.entry??0,withdrawals:-(byKind.withdrawal??0)};
}
export function cashSessionDetail(db,id){const s=db.prepare('SELECT c.*,u.email opened_by_email,cu.email closed_by_email FROM cash_sessions c JOIN users u ON u.id=c.opened_by LEFT JOIN users cu ON cu.id=c.closed_by WHERE c.id=?').get(id);if(!s)fail(404,'Caja no encontrada');return {...s,closing_summary:undefined,summary:cashSummary(db,s),movements:db.prepare('SELECT m.*,u.email actor,s.number sale_number FROM cash_movements m JOIN users u ON u.id=m.actor_id LEFT JOIN sales s ON s.id=m.sale_id WHERE m.session_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 100').all(id)};}
export function cashStatusForUser(db,user){
 if(user.role==='admin'||user.permissions?.includes('cash'))return {...cashStatus(db),can_view_balance:true};
 const active=activeCashSession(db);return {can_view_balance:false,active:active?{id:active.id,number:active.number,status:active.status,opened_at:active.opened_at}:null,history:[]};
}
export function cashStatus(db){const active=activeCashSession(db);return {active:active?cashSessionDetail(db,active.id):null,history:db.prepare('SELECT id,number,status,opened_at,closed_at,counted_cash,expected_cash,difference FROM cash_sessions ORDER BY number DESC LIMIT 20').all()};}
export function openCashSession(db,input,actor){const amount=integer(input.opening_balance,'Saldo inicial');return operation(db,actor,input.request_id,{kind:'cash-open',amount},()=>{if(activeCashSession(db))fail(409,'Ya hay una caja abierta para el local');const id=uuid(),number=db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM cash_sessions').get().n;db.prepare("INSERT INTO cash_sessions(id,number,status,opening_balance,opened_by,opened_at) VALUES (?,?,'open',?,?,?)").run(id,number,amount,actor,now());return cashSessionDetail(db,id);});}
export function cashMovement(db,input,actor){const id=text(input.session_id,'Caja',80,true),kind=input.kind,amount=integer(input.amount,'Monto',1),reason=text(input.reason,'Motivo',1000,true);if(!['entry','withdrawal'].includes(kind))fail(400,'Tipo de movimiento inválido');return operation(db,actor,input.request_id,{kind:'cash-movement',id,type:kind,amount,reason},()=>{const s=current(db,id);if(kind==='withdrawal'&&amount>balance(db,s))fail(409,'El retiro supera el efectivo disponible');db.prepare('INSERT INTO cash_movements(id,session_id,kind,amount,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?)').run(uuid(),id,kind,kind==='entry'?amount:-amount,reason,actor,now());return cashSessionDetail(db,id);});}
export function closeCashSession(db,input,actor){const id=text(input.session_id,'Caja',80,true),counted=integer(input.counted_cash,'Efectivo contado'),note=text(input.note??'','Observación',1000);return operation(db,actor,input.request_id,{kind:'cash-close',id,counted,note},()=>{const s=current(db,id),summary=cashSummary(db,s),difference=counted-summary.expected_cash;if(difference&&!note)fail(400,'Indica el motivo de la diferencia de caja');db.prepare("UPDATE cash_sessions SET status='closed',closed_by=?,closed_at=?,counted_cash=?,expected_cash=?,difference=?,closing_note=?,closing_summary=? WHERE id=? AND status='open'").run(actor,now(),counted,summary.expected_cash,difference,note,JSON.stringify(summary),id);return cashSessionDetail(db,id);});}
export function cashPaymentDetails(db,input,total,method){
 const session=activeCashSession(db),controlled=input.cash_control===true||input.cash_session_id!=null||input.cash_received!=null||!!session||!!db.prepare('SELECT 1 FROM cash_sessions LIMIT 1').get();
 if(input.expected_total!==undefined&&input.expected_total!==total)fail(409,'El total cambió. Revisa la venta y el vuelto antes de registrar el pago');
 if(method!=='cash')return {session_id:session?.id??null,received:null,change:null,controlled};
 if(!controlled)return {session_id:null,received:null,change:null,controlled:false};
 if(!session)fail(409,'Abre la caja del local antes de registrar un pago en efectivo');
 if(input.cash_session_id!==session.id)fail(409,'La caja cambió. Actualiza el punto de venta');
 const received=integer(input.cash_received,'Efectivo recibido');if(received<total)fail(400,'El efectivo recibido no alcanza para pagar la venta');return {session_id:session.id,received,change:received-total,controlled:true};
}
export function recordCashPayment(db,saleId,payment,actor){
 db.prepare('UPDATE sales SET cash_session_id=?,cash_received=?,cash_change=?,cash_controlled=? WHERE id=?').run(payment.session_id,payment.received,payment.change,payment.controlled?1:0,saleId);
 if(payment.received===null)return;
 for(const [kind,amount,reason] of [['sale_receipt',payment.received,'Efectivo recibido en venta'],['sale_change',-payment.change,'Vuelto entregado']])if(amount)db.prepare('INSERT INTO cash_movements(id,session_id,kind,amount,sale_id,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),payment.session_id,kind,amount,saleId,reason,actor,now());
}
export function refundPaymentWithinTransaction(db,saleId,amount,method,reason,actor){
 if(!['cash','card','transfer'].includes(method))fail(400,'Medio de devolución inválido');integer(amount,'Devolución',1);
 const sale=db.prepare('SELECT * FROM sales WHERE id=?').get(saleId);if(!sale)fail(404,'Venta no encontrada');
 const refunded=db.prepare('SELECT COALESCE(SUM(amount),0) n FROM cash_refunds WHERE sale_id=?').get(saleId).n;if(amount>sale.total-refunded)fail(409,'La devolución supera el importe pendiente de devolver');
 const session=activeCashSession(db);if(method==='cash'){if(!session)fail(409,'Abre la caja para registrar la devolución de efectivo');if(amount>balance(db,session))fail(409,'No hay efectivo suficiente para esta devolución');}
 const id=uuid();db.prepare('INSERT INTO cash_refunds VALUES (?,?,?,?,?,?,?,?)').run(id,saleId,session?.id??null,amount,method,reason,actor,now());
 if(method==='cash')db.prepare("INSERT INTO cash_movements(id,session_id,kind,amount,sale_id,refund_id,reason,actor_id,created_at) VALUES (?,?,'refund',?,?,?,?,?,?)").run(uuid(),session.id,-amount,saleId,id,reason,actor,now());return {id,amount,method};
}
export function refundCashPayment(db,input,actor){const saleId=text(input.sale_id,'Venta',80,true),amount=integer(input.amount,'Devolución',1),method=input.method,reason=text(input.reason,'Motivo',1000,true);return operation(db,actor,input.request_id,{kind:'cash-refund',saleId,amount,method,reason},()=>{const sale=db.prepare('SELECT status FROM sales WHERE id=?').get(saleId);if(!sale||sale.status!=='completed')fail(409,'Selecciona una venta registrada que no esté cancelada');return refundPaymentWithinTransaction(db,saleId,amount,method,reason,actor);});}
