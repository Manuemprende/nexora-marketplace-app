import React, { useState } from 'react';
import { Heading, SearchBox, MovementTable } from '../components/Common';
import { dayKey } from '../services/api';
export default function Movements({ rows }) {
  const [query, setQuery] = useState(''), [type, setType] = useState(''), [page, setPage] = useState(1);
  const [period,setPeriod]=useState('today');
  const filtered = rows.filter(m => (period==='all'||dayKey(m.created_at)===dayKey(new Date()))&&(!type || m.type === type) && `${m.sku} ${m.name} ${m.reason} ${m.actor}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), current = Math.min(page, pages);
  return <><Heading eyebrow="TRAZABILIDAD" title="Movimientos de inventario" subtitle="Cada entrada, salida, ajuste y venta conserva usuario, motivo y stock anterior/nuevo."/><div className="panel"><div className="toolbar"><div className="miniTabs"><button className={period==='today'?'active':null} onClick={()=>{setPeriod('today');setPage(1);}}>Hoy</button><button className={period==='all'?'active':null} onClick={()=>{setPeriod('all');setPage(1);}}>Historial</button></div><SearchBox value={query} onChange={q => { setQuery(q); setPage(1); }} placeholder="Filtrar SKU, producto, usuario o motivo"/><select aria-label="Tipo de movimiento" value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">Todos los movimientos</option>{Object.entries({ initial: 'Inicial', entry: 'Entrada', exit: 'Salida', adjustment: 'Ajuste', sale: 'Venta', reserve: 'Reserva', release: 'Liberación', packing: 'Empaque' }).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><MovementTable rows={filtered.slice((current - 1) * 20, current * 20)}/><div className="pagination"><button className="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>Anterior</button><span>{current} / {pages}</span><button className="outline" disabled={current === pages} onClick={() => setPage(current + 1)}>Siguiente</button></div></div></>;
}


