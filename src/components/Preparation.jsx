import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { date } from '../services/api';
import { packageCounts, packageComparison } from '../services/packageMetrics.mjs';

export function PreparationMetrics({orders,comparison=false}) {
  const [today,setToday]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setToday(new Date()),60000);return()=>clearInterval(timer);},[]);
  const counts=packageCounts(orders,today),compare=packageComparison(orders,today);
  const change=(value,before)=>before?`${value>=before?'+':''}${Math.round((value-before)/before*100)}% frente a ayer`:value?'Sin base ayer':'Sin cambios';
  return <div className="preparationMetrics"><div className="preparationMetricsHead"><div><b>Paquetes · Hoy</b><small>Llegados, preparados y cancelados hoy. Pendientes y falta de stock: bandeja actual, incluidos días anteriores.</small></div></div><div className="packageMetricGrid">{[['Llegados hoy',counts.arrived],['Preparados hoy',counts.ready],['Pendientes',counts.pending],['Cancelados hoy',counts.cancelled],['Falta de stock',counts.blocked]].map(([label,count])=><div key={label}><small>{label}</small><strong>{count}</strong></div>)}</div>{comparison&&<div className="packageComparison"><div><small>Llegados: hoy / ayer</small><b>{counts.arrived} / {compare.yesterday.arrived}</b><span>{change(counts.arrived,compare.yesterday.arrived)}</span></div><div><small>Preparados: hoy / ayer</small><b>{counts.ready} / {compare.yesterday.ready}</b><span>{change(counts.ready,compare.yesterday.ready)}</span></div><div><small>De los llegados hoy, preparados</small><b>{compare.cohortRate==null?'—':`${compare.cohortRate}%`}</b><span>{compare.cohortReady} de {counts.arrived} pedidos</span></div></div>}</div>;
}
export function PreparationStatus({order}) {
  const issues=order.stock_issues??[];
  return <><div className="packageDates">{[['Llegada del pedido',order.created_at],['Inicio de preparación',order.preparation_started_at],['Pedido preparado',order.packed_at]].map(([label,value])=><div key={label}><small>{label}</small><b>{value?date(value):'—'}</b></div>)}</div>{issues.length>0&&<div className="stockBlock" role="alert"><AlertTriangle size={20}/><div><b>No se puede preparar el paquete: falta inventario</b>{issues.map(issue=><p key={issue.variant_id}>{order.items.find(i=>i.variant_id===issue.variant_id)?.product.name}: {issue.missing>0?`faltan ${issue.missing} unidades`:issue.reason}.</p>)}</div></div>}</>;
}


