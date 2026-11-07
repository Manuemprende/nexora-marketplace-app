import React, { useState, useRef, useEffect } from 'react';
import { ScanBarcode, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Heading, ProductImage, StockTag } from '../components/Common';
import { api } from '../services/api';
export default function Scan() {
  const [query, setQuery] = useState(''), [matches, setMatches] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const input = useRef(null), sequence = useRef(0);
  useEffect(() => { input.current.focus(); }, []);
  async function scan(event) {
    event.preventDefault(); const current = ++sequence.current;
    if (!query.trim()) { setError('Escribe o escanea un código.'); setMatches(null); input.current.focus(); return; }
    setBusy(true); setError('');
    try { const result = await api('/search?q=' + encodeURIComponent(query.trim())); if (current === sequence.current) setMatches(result.matches); }
    catch (e) { if (current === sequence.current) { setMatches(null); setError(e.message); } }
    finally { if (current === sequence.current) { setBusy(false); input.current.focus(); input.current.select(); } }
  }
  const found = matches?.length === 1 ? matches[0] : null;
  return <><Heading eyebrow="OPERACIÓN DE BODEGA" title="Verificación de empaque" subtitle="Escanea o escribe un código de cualquier marketplace o plataforma."><span className="tag success">Pantalla de consulta rápida</span></Heading><div className="scanHero"><div className="scanSymbol"><ScanBarcode size={30}/></div><h2>¿Qué producto necesitas verificar?</h2><p>SKU maestro, Mercado Libre, Shopify, Falabella, Dropi, etc.</p><form className="scanInput" onSubmit={scan}><Search size={22}/><input ref={input} aria-label="Código de producto" placeholder="Ej: MELI-88310, DR-87452 o NEX-00125" value={query} onChange={e => setQuery(e.target.value)}/><button className="primary" disabled={busy}>{busy ? 'Buscando…' : 'Verificar'}</button></form></div><div aria-live="polite">{error ? <div className="empty formError"><AlertCircle/>{error}</div> : matches?.length === 0 ? <div className="empty"><AlertCircle/>Código desconocido. Revisa el ID o solicita su asociación al administrador.</div> : matches?.length > 1 ? <div className="panel result"><h3>Varias coincidencias: escanea el código exacto de la variante.</h3>{matches.map(p => <div className="item" key={p.id}><ProductImage product={p}/><div className="grow"><b>{p.name}</b><small>{p.attributes} · {p.sku}</small></div><StockTag product={p}/></div>)}</div> : found ? <div className="result"><div className="resultTop"><ProductImage product={found} large/><div className="grow"><span className="eyebrow">PRODUCTO IDENTIFICADO</span><h2>{found.name}</h2><p>{found.attributes} · SKU maestro: <b>{found.sku}</b></p><StockTag product={found}/><p className="fine">Físico: {found.stock} · Reservado: {found.reserved}</p></div><CheckCircle2 className="green" size={29}/></div><h3>Códigos asociados</h3><div className="codeGrid">{Object.entries(found.codes).map(([platform, code]) => <div className="code" key={platform}><small>{platform}</small><b>{code}</b></div>)}</div>{!Object.keys(found.codes).length && <p>Sin códigos externos. Puedes usar el SKU maestro.</p>}</div> : <div className="empty"><ScanBarcode size={26}/>Esperando lectura del producto…</div>}</div></>;
}
