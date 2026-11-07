import React, { useState, useEffect, useRef } from 'react';
import { Package, Search, X } from 'lucide-react';
import { available, date } from '../services/api';

export function Brand({ big = false }) {
  return <div className={big ? 'brandBig' : 'logo'}><img className="brandMark" src="/nexora-logo-transparent.png" alt="Nexora — Commerce Orchestration"/></div>;
}
export function Heading({ eyebrow, title, subtitle, children }) {
  return <div className="sectionHead"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>;
}
export function SearchBox({ value, onChange, placeholder = 'Buscar producto o código...' }) {
  return <div className="searchSmall"><Search size={18}/><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/></div>;
}
export function ProductImage({ product, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.image_url]);
  return <div className={large ? 'productHero' : 'productIcon'}>{product.image_url && !failed ? <img src={product.image_url} alt={product.name} onError={() => setFailed(true)}/> : <><Package size={large ? 52 : 21}/>{large && <small>Sin imagen disponible</small>}</>}</div>;
}
export function StockTag({ product }) {
  const stock = available(product);
  if(product.stock_confirmed===0)return <span className="tag neutral">Stock pendiente</span>;
  return <span className={'tag ' + (stock === 0 ? 'danger' : stock < 15 ? 'warning' : 'success')}>{stock === 0 ? 'Sin stock' : stock < 15 ? `${stock} · Stock bajo` : `${stock} disponibles`}</span>;
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus?.(); };
  }, []);
  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); onClose(); }}><div className="panelTitle"><h2>{title}</h2><button className="iconButton" aria-label="Cerrar ventana" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function Field({ label, ...props }) {
  const id = React.useId();
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} {...props}/></label>;
}
export function MovementTable({ rows }) {
  return <div className="tableWrap"><table><thead><tr><th>Fecha / usuario</th><th>Producto / SKU</th><th>Tipo</th><th>Cambio físico</th><th>Físico antes → después</th><th>Reservado antes → después</th><th>Motivo</th></tr></thead><tbody>{rows.map(m => <tr key={m.id}><td>{date(m.created_at)}<small>{m.actor}</small></td><td>{m.name}<small>{m.sku}</small></td><td>{{ initial: 'Inicial', entry: 'Entrada', exit: 'Salida', adjustment: 'Ajuste', sale: 'Venta', reserve:'Reserva',release:'Liberación',packing:'Empaque' }[m.type]||m.type}</td><td>{m.delta > 0 ? '+' : ''}{m.delta}</td><td>{m.before_qty} → {m.after_qty}</td><td>{m.reserved_before??0} → {m.reserved_after??0}</td><td>{m.reason}</td></tr>)}</tbody></table>{!rows.length && <p className="empty">Sin movimientos para este filtro.</p>}</div>;
}

