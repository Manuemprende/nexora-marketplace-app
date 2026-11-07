import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, Package, ScanBarcode, Link2, ShoppingCart, Plug, 
  Settings as SettingsIcon, LogOut, ChevronRight, ChevronDown, ChevronUp, 
  CheckCircle2, Bot, Users, Menu, Boxes, Sun, Moon, Truck, Share2, Radio, Globe,
  Lock, FileText, BarChart2, ShoppingBag, RotateCcw, HandHelping
} from 'lucide-react';
import { Brand } from './components/Common';
import { api } from './services/api';
import { clearViewCaches, readViewCache, writeViewCache } from './services/session-view-cache.mjs';
import { DemandAlertsProvider } from './components/DemandAlerts';
import SaleNotifications from './components/SaleNotifications';
import UserList from './pages/Users';
import Login from './pages/Login';
import Packing from './pages/Packing';
import Collecting from './pages/Collecting';
import Dashboard from './pages/Dashboard';
import Summary from './pages/Summary';
import InstallNexora from './components/InstallNexora';
import Catalog from './pages/Catalog';
import ChannelMapping from './pages/ChannelMapping';
import Movements from './pages/Movements';
import Pos from './pages/PointOfSale';
import Imports from './pages/Imports';
import { Returns } from './pages/Operations';
import DropeaControlCenter from './components/DropeaControlCenter';
import DropiControlCenter from './components/DropiControlCenter';
import FacebookGroupsCenter from './components/FacebookGroupsCenter';
import LiveShoppingCenter from './components/LiveShoppingCenter';
import LandingPagesCenter from './components/LandingPagesCenter';
import LandingOrdersPage from './components/LandingOrdersPage';
import SaleAlertBanner from './components/SaleAlertBanner';
import { Integrations, McpCenter as Mcp, Settings } from './pages/OtherPages';

const nav = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['summary', 'Resumen', Boxes],
  ['landings', 'Landing Pages', Globe],
  ['landing-orders', 'Pedidos Landings', ShoppingBag],
  ['live', 'Live Shopping', Radio],
  ['dropea', 'Dropea (COD)', Truck],
  ['dropi', 'Dropi Chile', Truck],
  ['facebook', 'Facebook Grupos', Share2],
  ['scan', 'Zona de empaque', ScanBarcode],
  ['collecting', 'Recolección', HandHelping],
  ['pos', 'Punto de venta', ShoppingCart],
  ['products', 'Productos y stock', Package],
  ['imports', 'Importar catálogo', Package],
  ['mapping', 'SKU maestro', Link2],
  ['returns', 'Devoluciones', RotateCcw],
  ['movements', 'Movimientos', Boxes],
  ['integrations', 'Integraciones', Plug],
  ['mcp', 'MCP / IA', Bot],
  ['users', 'Usuarios', Users],
  ['settings', 'Configuración', SettingsIcon]
];

const posSubNav = [
  ['pos', 'Nueva venta', ShoppingCart],
  ['pos-shifts', 'Caja y turnos', Lock],
  ['pos-history', 'Historial de ventas', FileText],
  ['pos-inventory', 'Inventario POS', Boxes],
  ['pos-customers', 'Clientes', Users],
  ['pos-reports', 'Reportes', BarChart2],
  ['pos-settings', 'Configuración POS', SettingsIcon]
];

const empty = { products: [], sales: [], movements: [], users: [], summary: { skus: 0, units: 0, low: 0, out: 0, sales: 0, recent: [] } };

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('nexora_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [boot, setBoot] = useState(() => {
    try {
      return !localStorage.getItem('nexora_user');
    } catch {
      return true;
    }
  });
  const [page, setPage] = useState(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) return hash;
    try {
      const last = localStorage.getItem('nexora_last_page');
      if (last) return last;
    } catch {}
    return 'dashboard';
  });
  const [posMenuOpen, setPosMenuOpen] = useState(true);
  const [data, setData] = useState(() => readViewCache('app-data') ?? empty);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('meibo-sidebar-collapsed') === 'true');
  const [theme, setTheme] = useState(() => localStorage.getItem('meibo-theme') === 'night' ? 'night' : 'day');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('meibo-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (user) writeViewCache('app-data', data);
  }, [user, data]);

  const has = (...sections) => user?.role === 'admin' || sections.some(s => {
    const list = user?.sections || user?.permissions || [];
    return list.includes(s) || (s === 'summary' && list.includes('dashboard')) || (['dropea', 'dropi', 'facebook', 'live', 'landings', 'landing-orders'].includes(s) && list.includes('integrations'));
  });
  const readOnly = section => user?.role !== 'admin' && Boolean(user?.read_only_sections?.includes(section));

  function toggleSidebar() {
    setCollapsed(value => {
      localStorage.setItem('meibo-sidebar-collapsed', String(!value));
      return !value;
    });
  }

  useEffect(() => {
    if (!sidebar) return;
    const escape = e => { if (e.key === 'Escape') setSidebar(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [sidebar]);

  function toast(message) { setNotice(message); }

  useEffect(() => {
    const expired = () => {
      clearViewCaches();
      setUser(null);
      try { localStorage.removeItem('nexora_user'); } catch {}
      setData(empty);
      setNotice('');
      setError('Tu sesión terminó. Inicia sesión de nuevo.');
    };
    window.addEventListener('meibo-session-expired', expired);
    window.addEventListener('nexora-session-expired', expired);
    return () => {
      window.removeEventListener('meibo-session-expired', expired);
      window.removeEventListener('nexora-session-expired', expired);
    };
  }, []);

  useEffect(() => {
    if (notice) {
      const timeout = setTimeout(() => setNotice(''), 4500);
      return () => clearTimeout(timeout);
    }
  }, [notice]);

  function go(next, activeUser = user) {
    if (posSubNav.some(n => n[0] === next)) {
      const canPos = activeUser?.role === 'admin' || (activeUser?.sections || activeUser?.permissions || []).includes('pos') || has('pos');
      if (!canPos) return;
      setPage(next);
      setPosMenuOpen(true);
      setSidebar(false);
      try { localStorage.setItem('nexora_last_page', next); } catch {}
      if (window.location.hash.slice(1) !== next) window.location.hash = next;
      return;
    }
    const allowedNav = nav.filter(n => activeUser?.role === 'admin' || (activeUser?.sections || activeUser?.permissions || []).includes(n[0]) || has(n[0]));
    next = allowedNav.some(n => n[0] === next) ? next : allowedNav[0]?.[0] ?? 'scan';
    setPage(next);
    setSidebar(false);
    try { localStorage.setItem('nexora_last_page', next); } catch {}
    if (window.location.hash.slice(1) !== next) window.location.hash = next;
  }

  useEffect(() => {
    let alive = true;
    api('/session')
      .then(u => {
        if (!alive) return;
        if (u) {
          setUser(u);
          try { localStorage.setItem('nexora_user', JSON.stringify(u)); } catch {}
        } else {
          setUser(null);
          try { localStorage.removeItem('nexora_user'); } catch {}
        }
      })
      .catch(e => {
        if (!alive) return;
        if (e.status === 401) {
          setUser(null);
          try { localStorage.removeItem('nexora_user'); } catch {}
        } else {
          setError(e.message);
        }
      })
      .finally(() => { if (alive) setBoot(false); });
    return () => { alive = false; };
  }, []);

  const [catalogLoading, setCatalogLoading] = useState(true);

  async function refresh() {
    if (!user) return;
    try {
      const session = await api('/session');
      if (!session) { setUser(null); setData(empty); return; }
      const currSections = session.sections || session.permissions || [];
      const prevSections = user.sections || user.permissions || [];
      if (JSON.stringify(currSections) !== JSON.stringify(prevSections) || JSON.stringify(session.read_only_sections) !== JSON.stringify(user.read_only_sections) || session.role !== user.role || session.operational_profile !== user.operational_profile) {
        setUser(session);
        try { localStorage.setItem('nexora_user', JSON.stringify(session)); } catch {}
        return;
      }
      setCatalogLoading(true);
      const [products, sales, movements, summary, users] = await Promise.all([
        has('products', 'pos', 'mapping', 'dashboard', 'summary', 'returns', 'live', 'dropea', 'dropi', 'facebook', 'integrations')
          ? api('/catalog?view=list')
          : Promise.resolve([]),
        has('pos', 'dashboard', 'summary', 'integrations') ? api('/sales') : Promise.resolve([]),
        has('movements', 'dashboard', 'summary') ? api('/movements') : Promise.resolve([]),
        has('dashboard', 'summary') ? api('/dashboard') : Promise.resolve(empty.summary),
        user.role === 'admin' || has('pos') ? api('/users').catch(() => []) : Promise.resolve([]),
      ]);
      setCatalogLoading(false);
      setData({ products, sales, movements, summary, users });
      setError('');
    } catch (e) {
      setCatalogLoading(false);
      if (e.status === 401) { setUser(null); setData(empty); }
      setError(e.message);
      throw e;
    }
  }

  useEffect(() => {
    if (!user) return;
    const route = window.location.hash.slice(1);
    go(route, user);
    refresh().catch(() => {});
    const onHash = () => {
      const h = window.location.hash.slice(1);
      if (h) go(h, user);
    };
    window.addEventListener('hashchange', onHash);
    const interval = setInterval(() => refresh().catch(() => {}), 25000);
    return () => { window.removeEventListener('hashchange', onHash); clearInterval(interval); };
  }, [user]);

  async function logout() {
    try {
      await api('/logout', { method: 'POST', body: {} });
      clearViewCaches();
      setUser(null);
      try {
        localStorage.removeItem('nexora_user');
        localStorage.removeItem('nexora_last_page');
      } catch {}
      setData(empty);
      setNotice('');
      window.location.hash = '';
    } catch (e) {
      toast(e.message);
    }
  }

  if (boot) return <div className="empty">Cargando sesión…</div>;
  if (!user) return (
    <>
      <Login onLogin={u => {
        clearViewCaches();
        try { localStorage.setItem('nexora_user', JSON.stringify(u)); } catch {}
        const currentHash = window.location.hash.replace(/^#/, '');
        const savedPage = localStorage.getItem('nexora_last_page');
        const defaultDest = nav.find(n => u.role === 'admin' || (u.sections || u.permissions || []).includes(n[0]))?.[0] ?? 'dashboard';
        const destination = currentHash || savedPage || defaultDest;
        setUser(u);
        setError('');
        go(destination, u);
      }} />
      {error && <div className="toast" role="alert">{error}</div>}
    </>
  );

  const allowed = nav.filter(n => has(n[0]));
  const sectionKey = page.startsWith('pos') ? 'pos' : page;
  const props = { ...data, refresh, toast, readOnly: readOnly(sectionKey) };

  return (
    <DemandAlertsProvider currentUser={boot ? null : user} onOpen={() => go('products')}>
      <div className="app">
        {sidebar && <button className="sidebarBackdrop" aria-label="Cerrar menú" onClick={() => setSidebar(false)} />}
        
        <aside className={'side' + (sidebar ? ' open' : '') + (collapsed ? ' collapsed' : '')}>
          <button 
            className="sidebarBrand" 
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} 
            aria-expanded={!collapsed} 
            title={collapsed ? 'Expandir menú' : 'Contraer menú'} 
            onClick={toggleSidebar}
          >
            <Brand />
          </button>

          <div className="sideLabel">ESPACIO DE TRABAJO</div>
          
          <nav>
            {allowed.map(([id, label, Icon]) => {
              if (id === 'pos') {
                const isPosActive = page.startsWith('pos');
                return (
                  <div key="pos-group" className="pos-nav-group">
                    <button 
                      className={`nav pos-parent-nav ${isPosActive ? 'active-parent' : ''}`}
                      title={collapsed ? 'Punto de venta' : undefined}
                      onClick={() => {
                        if (collapsed) {
                          setCollapsed(false);
                          setPosMenuOpen(true);
                          go('pos');
                        } else {
                          setPosMenuOpen(!posMenuOpen);
                          if (!isPosActive) go('pos');
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={18} />
                        <span className="navLabel">Punto de venta</span>
                      </div>
                      {!collapsed && (
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                          {posMenuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      )}
                    </button>

                    {posMenuOpen && !collapsed && (
                      <div className="pos-subnav-list">
                        {posSubNav.map(([subId, subLabel, SubIcon]) => {
                          const isSubActive = page === subId;
                          return (
                            <button 
                              key={subId} 
                              className={`nav pos-subnav-item ${isSubActive ? 'active' : ''}`}
                              onClick={() => go(subId)}
                            >
                              <SubIcon size={15} />
                              <span className="navLabel">{subLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button 
                  key={id} 
                  className={page === id ? 'nav active' : 'nav'} 
                  aria-label={label} 
                  title={collapsed ? label : undefined} 
                  onClick={() => go(id)}
                >
                  <Icon size={18} />
                  <span className="navLabel">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="sideBottom">
            <div className="profile">
              <span className="avatar">{user.role === 'admin' ? 'AD' : user.operational_profile === 'collector' ? 'RE' : 'EM'}</span>
              <div>
                <b>{user.role === 'admin' ? 'Administrador' : user.operational_profile === 'collector' ? 'Recolector' : user.operational_profile === 'packer' ? 'Empaquetador' : 'Operador'}</b>
                <small>{user.email}</small>
              </div>
            </div>
            <button className="nav" aria-label="Cerrar sesión" title={collapsed ? 'Cerrar sesión' : undefined} onClick={logout}>
              <LogOut size={18} />
              <span className="navLabel">Cerrar sesión</span>
            </button>
          </div>
        </aside>

        <main>
          <header>
            <button className="mobileMenu" aria-label={sidebar ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}>
              <Menu />
            </button>
            
            <div className="crumb">
              Nexora
              <ChevronRight size={14} />
              {page.startsWith('pos') ? 'Punto de venta' : nav.find(x => x[0] === page)?.[1]}
              {page.startsWith('pos') && (
                <>
                  <ChevronRight size={14} />
                  <span style={{ fontWeight: 700, color: 'var(--brand, #1e60ff)' }}>
                    {posSubNav.find(x => x[0] === page)?.[1] || 'Nueva venta'}
                  </span>
                </>
              )}
            </div>

            <div className="headRight">
              <InstallNexora />
              <SaleNotifications user={user} onOpen={() => { go('pos'); refresh().catch(() => {}); }} />
              <button 
                className="themeToggle" 
                aria-label={theme === 'day' ? 'Modo día activo. Cambiar a modo noche' : 'Modo noche activo. Cambiar a modo día'} 
                title={theme === 'day' ? 'Modo día activo · Cambiar a noche' : 'Modo noche activo · Cambiar a día'} 
                aria-pressed={theme === 'night'} 
                onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}
              >
                {theme === 'day' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <span className="demoPill">
                {import.meta.env.VITE_NEXORA_HOSTED === 'true' ? '● NEXORA · EN LÍNEA' : '● NEXORA · LOCAL'}
              </span>
              <span className="avatar">{user.role === 'admin' ? 'AD' : user.operational_profile === 'collector' ? 'RE' : 'EM'}</span>
            </div>
          </header>

          <section className={"content" + (page === "landing-orders" || collapsed ? " nx-full-width" : "")}>
            {error && (
              <div className="callout formError" role="alert">
                {error}
                <button className="outline" onClick={() => refresh().catch(() => {})}>Reintentar</button>
              </div>
            )}

            {readOnly(sectionKey) && (
              <p className="callout">Solo lectura · Puedes consultar esta sección sin modificar datos.</p>
            )}

            {page === 'scan' ? (
              <Packing role={user.role} readOnly={readOnly('scan')} canCollect={has('collecting') && !readOnly('collecting')} refreshInventory={refresh} toast={toast} />
            ) : page === 'collecting' ? (
              <Collecting role={user.role} readOnly={readOnly('collecting')} toast={toast} />
            ) : (
              <>
                {page === 'dashboard' && <Dashboard {...props} go={go} />}
                {page === 'summary' && <Summary {...props} go={go} />}
                {page === 'landings' && <LandingPagesCenter products={data.products} toast={toast} />}
                {page === 'landing-orders' && <LandingOrdersPage toast={toast} />}
                {page === 'live' && <LiveShoppingCenter products={data.products} toast={toast} />}
                {page === 'dropea' && <DropeaControlCenter products={data.products} toast={toast} />}
                {page === 'dropi' && <DropiControlCenter products={data.products} refresh={refresh} toast={toast} />}
                {page === 'facebook' && <FacebookGroupsCenter products={data.products} toast={toast} />}
                {page === 'products' && <Catalog currentUser={user} {...props} />}
                {page === 'imports' && <Imports {...props} />}
                {page === 'mapping' && <ChannelMapping {...props} />}
                {page === 'returns' && <Returns {...props} />}
                {page === 'movements' && <Movements rows={data.movements} />}
                {page.startsWith('pos') && (
                  <Pos 
                    {...props}
                    currentUser={user}
                    catalogLoading={catalogLoading}
                    activeSubTab={page === 'pos' ? 'sale' : page.replace('pos-', '')} 
                    onTabChange={(tab) => go(tab === 'sale' ? 'pos' : `pos-${tab}`)} 
                  />
                )}
                {page === 'integrations' && <Integrations sales={data.sales} products={data.products} toast={toast} />}
                {page === 'mcp' && <Mcp />}
                {page === 'users' && <UserList currentUser={user} users={data.users} refresh={refresh} toast={toast} />}
                {page === 'settings' && <Settings {...props} />}
              </>
            )}
          </section>
        </main>

        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {notice}
          </div>
        )}

        <SaleAlertBanner />
      </div>
    </DemandAlertsProvider>
  );
}
