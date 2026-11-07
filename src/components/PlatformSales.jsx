import React,{useState} from 'react';
import {money} from '../services/api';
import {platformTotals} from '../services/platformTotals.mjs';
export default function PlatformSales({orders,sales,products}){
 const [period,setPeriod]=useState('today');
 const taggedSales=sales.map(s=>({...s,items:s.items.map(i=>({...i,is_demo:products.find(p=>p.id===i.variant_id)?.is_demo??false}))}));
 const rows=platformTotals(orders,taggedSales,{period});
 return <div className="panel historyPanel"><div className="panelTitle"><div><h3>Ventas por plataforma</h3><p className="muted">Pedidos registrados por origen, independientes del empaque. POS muestra ventas cobradas.</p></div><div className="miniTabs"><button className={period==='today'?'active':''} onClick={()=>setPeriod('today')}>Hoy</button><button className={period==='all'?'active':''} onClick={()=>setPeriod('all')}>Todos</button></div></div><div className="tableWrap"><table><thead><tr><th>Plataforma</th><th>Monto registrado</th><th>Pedidos</th><th>Unidades</th><th>Preparados</th><th>Cancelados</th><th>Precio pendiente</th></tr></thead><tbody>{rows.map(r=><tr key={r.platform}><td><b>{r.platform==='Jumpseller'?'Jumpseller · Web':r.platform}</b></td><td><b>{money(r.amount)}</b></td><td>{r.orders}</td><td>{r.units}</td><td>{r.platform==='POS'?'—':r.packed}</td><td>{r.platform==='POS'?'—':r.cancelled}</td><td>{r.unpriced?`${r.unpriced} pedidos`:'—'}</td></tr>)}</tbody></table></div><p className="fine">Cancelados fuera del monto. Pedidos con precio pendiente se cuentan sin sumar un valor estimado.</p></div>;
}
