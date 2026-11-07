import React,{useEffect,useState} from 'react';
import PlatformSales from '../components/PlatformSales';
import {api,available} from '../services/api';
import {PreparationMetrics} from '../components/Preparation';
import {ScanBarcode} from 'lucide-react';
import {Heading} from '../components/Common';
export default function Summary({products,summary,sales,go}){
 const [orders,setOrders]=useState([]);
 useEffect(()=>{let alive=true;const load=()=>api('/orders').then(rows=>{if(alive)setOrders(rows);}).catch(()=>{});load();const timer=setInterval(load,15000);return()=>{alive=false;clearInterval(timer);};},[]);
 const attention=products.filter(p=>p.active&&(!p.stock_confirmed||available(p)<15)).length;
 return <><Heading eyebrow="VISTA GENERAL" title="Resumen de operaciones" subtitle="Inventario, paquetes y ventas de un vistazo."><button className="primary small" onClick={()=>go('scan')}><ScanBarcode size={16}/>Abrir empaque</button></Heading><div className="stats">{[['Productos registrados',summary.skus,'SKU maestros activos'],['Unidades disponibles',summary.units,'Físico menos reservado'],['Productos por revisar',attention,`${summary.low} stock bajo · ${summary.out} sin stock · ${summary.pending??0} por cargar`],['Ventas registradas',summary.sales,'Ventas locales guardadas']].map(([label,value,note])=><div className="stat" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small>{label==='Productos por revisar'&&<button className="link dashboardAttentionLink" onClick={()=>go('products')}>Ver inventario →</button>}</div>)}</div><PreparationMetrics orders={orders} comparison/><div className="callout"><b>Recepción de devoluciones</b><p>El registro de devoluciones recibidas aún está pendiente de implementación.</p></div><PlatformSales orders={orders} sales={sales} products={products}/></>;
}
