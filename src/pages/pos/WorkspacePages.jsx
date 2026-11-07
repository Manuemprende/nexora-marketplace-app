import React, { useState, useMemo, useEffect } from 'react';
import { Search, Package, Wallet, Receipt as ReceiptIcon, Users, BarChart3, Settings, Plus, ArrowDownLeft, ArrowUpRight, Printer, CheckCircle2 } from 'lucide-react';
import { money, available, api, readApiView } from '../../services/api';
import { usePolling } from '../../services/usePolling';
import CashDrawer from '../../components/CashDrawer';
import Receipt from '../../components/Receipt';

const today = s => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date(s));
const pay = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
const num = n => new Intl.NumberFormat('es-CL').format(n);

function Head({ title, subtitle, children }) {
  return (
    <div className="posv-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="posv-actions">{children}</div>
    </div>
  );
}

function Card({ label, value, note, Icon = Package }) {
  return (
    <div className="posv-card posv-metric">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="posv-empty">
      <Package size={25} />
      <p>{text}</p>
    </div>
  );
}

function Pager({ page, setPage, total, size = 15 }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="posv-pagination">
      <small>{num(total)} registros</small>
      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
      <b>{page} / {pages}</b>
      <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
    </div>
  );
}

export function History({ sales = [] }) {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('today');
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState(null);
  const rows = sales.filter(s => (period === 'all' || today(s.created_at) === today(Date.now())) && `${s.number} ${s.customer_name} ${s.customer_rut || ''}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="posv">
      <Head title="Historial de ventas" subtitle="Comprobantes y pagos registrados en el punto de venta." />
      <div className="posv-card">
        <div className="posv-toolbar">
          <label className="posv-search">
            <Search size={17} />
            <input placeholder="Buscar venta o cliente" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
          </label>
          <div className="miniTabs">
            {[['today', 'Hoy'], ['all', 'Todas']].map(([id, label]) => (
              <button className={period === id ? 'active' : ''} key={id} onClick={() => { setPeriod(id); setPage(1); }}>{label}</button>
            ))}
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Venta / fecha</th>
                <th>Cliente</th>
                <th>Unidades</th>
                <th>Medio de pago</th>
                <th>Total</th>
                <th>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 15, page * 15).map(s => (
                <tr key={s.id}>
                  <td>
                    <b>#{String(s.number).padStart(6, '0')}</b>
                    <small className="posv-secondary">{new Date(s.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</small>
                  </td>
                  <td>{s.customer_name || 'Cliente mostrador'}</td>
                  <td>{s.items.reduce((n, i) => n + i.qty, 0)}</td>
                  <td><span className="tag neutral">{pay[s.payment_method] || s.payment_method}</span></td>
                  <td><b>{money(s.total)}</b></td>
                  <td>
                    <button className="posv-icon" aria-label={`Ver comprobante ${s.number}`} onClick={() => setReceipt(s)}>
                      <ReceiptIcon size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty text="No hay ventas en este período." />}
        <Pager page={page} setPage={setPage} total={rows.length} />
      </div>
      {receipt && <Receipt sale={receipt} close={() => setReceipt(null)} />}
    </div>
  );
}

export function Inventory({ products = [] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const active = products.filter(p => !!p.active);
  const rows = active.filter(p => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'pending' && !p.stock_confirmed) || (filter === 'low' && p.stock_confirmed && available(p) > 0 && available(p) < 15) || (filter === 'out' && p.stock_confirmed && available(p) === 0)));
  return (
    <div className="posv">
      <Head title="Inventario POS" subtitle="Disponibilidad real de los productos de mostrador." />
      <div className="posv-metrics">
        <Card label="Variantes activas" value={num(active.length)} note="Catálogo central" />
        <Card label="Unidades disponibles" value={num(active.reduce((n, p) => n + available(p), 0))} note="Físico menos reservado" />
        <Card label="Stock por confirmar" value={num(active.filter(p => !p.stock_confirmed).length)} note="Requieren recuento físico" />
      </div>
      <div className="posv-card">
        <div className="posv-toolbar">
          <label className="posv-search">
            <Search size={17} />
            <input placeholder="Buscar producto, SKU o categoría" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
          </label>
          <select aria-label="Filtrar existencias" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>
            <option value="all">Todos los productos</option>
            <option value="low">Stock bajo</option>
            <option value="out">Sin stock</option>
            <option value="pending">Por confirmar</option>
          </select>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Precio</th>
                <th>Disponible</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 15, page * 15).map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="posv-product">
                      {p.image_url ? <img loading="lazy" src={p.image_url} alt="" /> : <Package size={24} />}
                      <div>
                        <b>{p.name}</b>
                        <small>{p.category}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.sku}</td>
                  <td>{money(p.price)}</td>
                  <td><b>{available(p)}</b></td>
                  <td>
                    <span className={'tag ' + (!p.stock_confirmed ? 'neutral' : available(p) > 14 ? 'success' : 'warning')}>
                      {!p.stock_confirmed ? 'Por confirmar' : available(p) > 0 ? 'Disponible' : 'Sin stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty text="No hay productos para este filtro." />}
        <Pager page={page} setPage={setPage} total={rows.length} />
      </div>
    </div>
  );
}

export function Customers({ sales = [] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [directory, setDirectory] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    let active = true;
    api('/pos/customers?q=' + encodeURIComponent(query))
      .then(rows => { if (active) { setDirectory(rows); setErr(''); } })
      .catch(e => { if (active) setErr(e.message); });
    return () => { active = false; };
  }, [query]);
  const customers = useMemo(() => {
    const map = new Map();
    sales.filter(s => s.customer_name && s.customer_name !== 'Cliente mostrador').forEach(s => {
      const key = s.customer_rut || s.customer_name;
      const c = map.get(key) || { key, name: s.customer_name, rut: s.customer_rut || '—', amount: 0, count: 0 };
      c.amount += s.total;
      c.count++;
      map.set(key, c);
    });
    return [...map.values()];
  }, [sales]);
  const rows = directory.map(c => ({
    ...c,
    key: c.id,
    ...(customers.find(s => s.rut === c.rut) || {}),
    count: customers.find(s => s.rut === c.rut)?.count || 0,
    amount: customers.find(s => s.rut === c.rut)?.amount || 0
  }));
  return (
    <div className="posv">
      {err && <p className="formError">{err}</p>}
      <Head title="Clientes" subtitle="Clientes identificados en las ventas registradas." />
      <div className="posv-card">
        <div className="posv-toolbar">
          <label className="posv-search">
            <Search size={17} />
            <input placeholder="Buscar nombre o RUT" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
          </label>
          <span className="tag neutral">{rows.length} clientes</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>RUT</th>
                <th>Compras</th>
                <th>Total acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 15, page * 15).map(c => (
                <tr key={c.key}>
                  <td><b>{c.name}</b></td>
                  <td>{c.rut}</td>
                  <td>{c.count}</td>
                  <td><b>{money(c.amount)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty text="Los clientes aparecerán al registrar ventas con sus datos." />}
        <Pager page={page} setPage={setPage} total={rows.length} />
      </div>
    </div>
  );
}

export function Reports({ sales = [] }) {
  const [period, setPeriod] = useState('today');
  const rows = sales.filter(s => period === 'all' || today(s.created_at) === today(Date.now()));
  const total = rows.reduce((n, s) => n + s.total, 0);
  const items = rows.reduce((n, s) => n + s.items.reduce((v, i) => v + i.qty, 0), 0);
  const top = new Map();
  rows.forEach(s => s.items.forEach(i => {
    const p = top.get(i.variant_id) || { name: i.name, qty: 0, amount: 0 };
    p.qty += i.qty;
    p.amount += i.qty * i.price;
    top.set(i.variant_id, p);
  }));
  return (
    <div className="posv">
      <Head title="Reportes POS" subtitle="Análisis de ventas registradas en mostrador.">
        <div className="miniTabs">
          {[['today', 'Hoy'], ['all', 'Todo']].map(([id, text]) => (
            <button key={id} className={period === id ? 'active' : ''} onClick={() => setPeriod(id)}>{text}</button>
          ))}
        </div>
      </Head>
      <div className="posv-metrics">
        <Card Icon={Wallet} label="Total vendido" value={money(total)} note={`${rows.length} ventas registradas`} />
        <Card Icon={BarChart3} label="Ticket promedio" value={money(rows.length ? Math.round(total / rows.length) : 0)} note="Por venta" />
        <Card label="Unidades vendidas" value={num(items)} note="Del período seleccionado" />
      </div>
      <div className="posv-columns">
        <section className="posv-card">
          <h2>Medios de pago</h2>
          {Object.entries(pay).map(([id, text]) => {
            const amount = rows.filter(s => s.payment_method === id).reduce((n, s) => n + s.total, 0);
            return (
              <div className="posv-payment-report" key={id}>
                <div>
                  <span>{text}</span>
                  <b>{money(amount)}</b>
                </div>
                <div className="posv-track">
                  <i style={{ width: `${total ? (amount / total) * 100 : 0}%` }} />
                </div>
                <small>{total ? Math.round((amount / total) * 100) : 0}% del total</small>
              </div>
            );
          })}
        </section>
        <section className="posv-card">
          <h2>Productos más vendidos</h2>
          {[...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 6).map(p => (
            <div className="posv-report-row" key={p.name}>
              <div>
                <b>{p.name}</b>
                <small>{p.qty} unidades</small>
              </div>
              <strong>{money(p.amount)}</strong>
            </div>
          ))}
          {!top.size && <Empty text="Sin ventas en este período." />}
        </section>
      </div>
    </div>
  );
}

export function Shifts({ sales = [], refresh, currentUser, readOnly }) {
  const [cashStatus, setCashStatus] = useState(() => readApiView('/cash/status'));
  const [cashError, setCashError] = useState('');

  async function refreshCash() {
    try {
      setCashStatus(await api('/cash/status'));
      setCashError('');
    } catch (e) {
      setCashError(e.message);
    }
  }

  usePolling(() => refreshCash(), 15000);

  const active = cashStatus?.active;
  const history = cashStatus?.history || [];

  return (
    <div className="posv">
      <Head title="Caja y turnos" subtitle="Apertura, arqueo, ingresos, retiros e historial de turnos de caja en base de datos." />
      {cashError && <p className="formError">{cashError}</p>}
      <CashDrawer
        canViewSellers={currentUser?.role === 'admin'}
        canViewBalance={currentUser?.role === 'admin' || currentUser?.permissions?.includes('cash')}
        status={cashStatus}
        readOnly={readOnly || (currentUser?.role !== 'admin' && currentUser?.read_only_sections?.includes('cash'))}
        onRefresh={refreshCash}
        sales={sales}
        refreshSales={refresh}
      />
      <div className="posv-metrics" style={{ marginTop: 18 }}>
        <Card
          Icon={Wallet}
          label="Efectivo en caja"
          value={money(active?.current_balance ?? 0)}
          note={active ? `Apertura: ${money(active.opening_balance)}` : 'Caja cerrada'}
        />
        <Card
          label="Ventas en efectivo (turno)"
          value={money(active?.cash_sales ?? 0)}
          note={active ? `Vueltos: ${money(active.cash_change ?? 0)}` : 'Sin turno activo'}
        />
        <Card
          label="Estado de caja"
          value={active ? 'Abierta' : 'Cerrada'}
          note={active ? `Abierta por ${active.opened_by_email || 'Operador'}` : `${history.length} turnos anteriores`}
        />
      </div>
    </div>
  );
}

export function Preferences({ toast }) {
  const [value, setValue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nexora-pos-preferences')) || { storeName: 'Nexora', cashRegister: 'Caja 01', printerWidth: '80mm', footerMsg: 'Gracias por tu compra' };
    } catch {
      return { storeName: 'Nexora', cashRegister: 'Caja 01', printerWidth: '80mm', footerMsg: 'Gracias por tu compra' };
    }
  });
  return (
    <div className="posv">
      <Head title="Configuración POS" subtitle="Preferencias de este dispositivo." />
      <form
        className="posv-card posv-settings posv-form"
        onSubmit={e => {
          e.preventDefault();
          localStorage.setItem('nexora-pos-preferences', JSON.stringify(value));
          toast?.('Preferencias guardadas en este dispositivo.');
        }}
      >
        <h2><Settings size={18} /> Terminal de venta</h2>
        {[['storeName', 'Nombre del comercio'], ['cashRegister', 'Identificación de caja']].map(([id, text]) => (
          <label key={id}>
            {text}
            <input value={value[id] || ''} onChange={e => setValue({ ...value, [id]: e.target.value })} />
          </label>
        ))}
        <label>
          Ancho de papel
          <select value={value.printerWidth} onChange={e => setValue({ ...value, printerWidth: e.target.value })}>
            <option>80mm</option>
            <option>58mm</option>
          </select>
        </label>
        <label>
          Mensaje de referencia al pie
          <textarea value={value.footerMsg || ''} onChange={e => setValue({ ...value, footerMsg: e.target.value })} />
        </label>
        <p className="posv-secondary">La impresión usa el comprobante interno y el diálogo del navegador.</p>
        <button className="primary">Guardar preferencias locales</button>
      </form>
    </div>
  );
}
