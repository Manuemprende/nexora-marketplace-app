import React, { useEffect, useState, useRef } from 'react';
import { 
  LayoutDashboard, Package, ScanBarcode, Link2, ShoppingCart, Plug, 
  Settings as SettingsIcon, LogOut, ChevronRight, ChevronDown, ChevronUp, 
  CheckCircle2, Bot, Users, Menu, Boxes, Sun, Moon, Truck, Share2, Radio,
  Lock, FileText, BarChart2
} from 'lucide-react';
import { Brand } from './components/Common';
import { api } from './services/api';
import UserList from './pages/Users';
import Login from './pages/Login';
import Packing from './pages/Packing';
import Dashboard from './pages/Dashboard';
import Summary from './pages/Summary';
import InstallNexora from './components/InstallNexora';
import Catalog from './pages/Catalog';
import Mapping from './pages/Mapping';
import Movements from './pages/Movements';
import Pos from './pages/PointOfSale';
import Imports from './pages/Imports';
import DropeaControlCenter from './components/DropeaControlCenter';
import DropiControlCenter from './components/DropiControlCenter';
import FacebookGroupsCenter from './components/FacebookGroupsCenter';
import LiveShoppingCenter from './components/LiveShoppingCenter';
import { Integrations, Mcp, Settings } from './pages/OtherPages';

const nav = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['summary', 'Resumen', Boxes],
  ['live', 'Live Shopping', Radio],
  ['dropea', 'Dropea (COD)', Truck],
  ['dropi', 'Dropi Chile', Truck],
  ['facebook', 'Facebook Grupos', Share2],
  ['scan', 'Zona de empaque', ScanBarcode],
  ['pos', 'Punto de Venta', ShoppingCart],
  ['products', 'Productos y stock', Package],
  ['imports', 'Importar catálogo', Package],
  ['mapping', 'SKU maestro', Link2],
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
  const [user, setUser] = useState(null);
  const [boot, setBoot] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [posMenuOpen, setPosMenuOpen] = useState(true);
  const [data, setData] = useState(empty);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('meibo-sidebar-collapsed') === 'true');
  const [theme, setTheme] = useState(() => localStorage.getItem('meibo-theme') === 'night' ? 'night' : 'day');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('meibo-theme', theme);
  }, [theme]);

  const has = (...sections) => user?.role === 'admin' || sections.some(s => user?.permissions?.includes(s === 'summary' ? 'dashboard' : (s === 'dropea' || s === 'dropi' || s === 'facebook' || s === 'live') ? 'integrations' : s));

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
      setUser(null);
      catalogLoaded.current=false;
      setData(empty);
      setNotice('');
      setError('Tu sesión terminó. Inicia sesión de nuevo.');
    };
    window.addEventListener('meibo-session-expired', expired);
    return () => window.removeEventListener('meibo-session-expired', expired);
  }, []);

  useEffect(() => {
    if (notice) {
      const timeout = setTimeout(() => setNotice(''), 4500);
      return () => clearTimeout(timeout);
    }
  }, [notice]);

  function go(next) {
    if (posSubNav.some(n=>n[0]===next)) {
      if (!has('pos')) return;
      setPage(next);
      setSidebar(false);
      window.location.hash = next;
      return;
    }
    const allowedNav = nav.filter(n => has(n[0]));
    next = allowedNav.some(n => n[0] === next) ? next : allowedNav[0]?.[0] ?? 'scan';
    setPage(next);
    setSidebar(false);
    window.location.hash = next;
  }

  useEffect(() => {
    let alive = true;
    api('/session')
      .then(u => { if (alive) setUser(u); })
      .catch(e => { if (alive && e.status !== 401) setError(e.message); })
      .finally(() => { if (alive) setBoot(false); });
    return () => { alive = false; };
  }, []);

  const refreshBusy=useRef(false),catalogLoaded=useRef(false);
  const [catalogLoading,setCatalogLoading]=useState(true);
  async function refresh(force = false) {
    if (!user || refreshBusy.current) return;
    refreshBusy.current=true;
    try {
      const session = await api('/session');
      if (!session) { setUser(null); setData(empty); return; }
      if (JSON.stringify(session.permissions) !== JSON.stringify(user.permissions) || session.role !== user.role) {
        setUser(session);
        return;
      }
      const shouldFetchProducts = window.location.hash.slice(1)!=='pos' && (force || (!catalogLoaded.current && has('products', 'pos', 'mapping', 'dashboard', 'integrations')));
      let newProducts=null;
      if(shouldFetchProducts){
        setCatalogLoading(true);
        try{newProducts=await api('/catalog');catalogLoaded.current=true;setData(prev=>({...prev,products:newProducts}));}
        finally{setCatalogLoading(false);}
      }
      const route=window.location.hash.slice(1);
      const update=async(key,path)=>{const value=await api(path);setData(prev=>({...prev,[key]:value}));};
      const tasks=[];
      if((route.startsWith('pos')||['dashboard','summary','integrations'].includes(route))&&has('pos','dashboard','integrations'))tasks.push(update('sales','/sales'));
      if(route==='movements'&&has('movements'))tasks.push(update('movements','/movements'));
      if(['dashboard','summary'].includes(route)&&has('dashboard'))tasks.push(update('summary','/dashboard'));
      if(route==='users'&&user.role==='admin')tasks.push(update('users','/users'));
      await Promise.all(tasks);
      setError('');
    } catch (e) {
      if (e.status === 401) { setUser(null); setData(empty); }
      setError(e.message);
      throw e;
    } finally {refreshBusy.current=false;}
  }

  useEffect(() => {
    if (!user) return;
    const route = window.location.hash.slice(1);
    go(route);
    refresh().catch(() => {});
    const onHash = () => {go(window.location.hash.slice(1));refresh().catch(()=>{});};
    window.addEventListener('hashchange', onHash);
    const interval = setInterval(() => refresh().catch(() => {}), 15000);
    return () => { window.removeEventListener('hashchange', onHash); clearInterval(interval); };
  }, [user]);

  async function logout() {
    try {
      await api('/logout', { method: 'POST', body: {} });
      setUser(null);
      catalogLoaded.current=false;
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
        const destination = nav.find(n => u.role === 'admin' || u.permissions?.includes(n[0]))?.[0] ?? 'scan';
        window.location.hash = destination;
        setPage(destination);
        setUser(u);
        setError('');
      }} />
      {error && <div className="toast" role="alert">{error}</div>}
    </>
  );

  const allowed = nav.filter(n => has(n[0]));
  const props = { ...data, refresh, toast };

  return (
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
                    title={collapsed ? 'Punto de Venta' : undefined}
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
                      <span className="navLabel">Punto de Venta</span>
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
            <span className="avatar">{user.role === 'admin' ? 'AD' : 'EM'}</span>
            <div>
              <b>{user.role === 'admin' ? 'Administrador' : 'Operador'}</b>
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
            {page.startsWith('pos') ? 'Punto de Venta' : nav.find(x => x[0] === page)?.[1]}
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
            <span className="avatar">{user.role === 'admin' ? 'AD' : 'EM'}</span>
          </div>
        </header>

        <section className="content">
          {error && (
            <div className="callout formError" role="alert">
              {error}
              <button className="outline" onClick={() => refresh().catch(() => {})}>Reintentar</button>
            </div>
          )}

          {page === 'scan' ? (
            <Packing role={user.role} refreshInventory={refresh} toast={toast} />
          ) : (
            <>
              {page === 'dashboard' && <Dashboard {...props} go={go} />}
              {page === 'summary' && <Summary {...props} go={go} />}
              {page === 'live' && <LiveShoppingCenter products={data.products} toast={toast} />}
              {page === 'dropea' && <DropeaControlCenter products={data.products} toast={toast} />}
              {page === 'dropi' && <DropiControlCenter products={data.products} toast={toast} />}
              {page === 'facebook' && <FacebookGroupsCenter products={data.products} toast={toast} />}
              {page === 'products' && <Catalog {...props} />}
              {page === 'imports' && <Imports {...props} />}
              {page === 'mapping' && <Mapping {...props} />}
              {page === 'movements' && <Movements rows={data.movements} />}
              {page.startsWith('pos') && (
                <Pos 
                  {...props} catalogLoading={catalogLoading}
                  activeSubTab={page === 'pos' ? 'sale' : page.replace('pos-', '')} 
                  onTabChange={(tab) => go(tab === 'sale' ? 'pos' : `pos-${tab}`)} 
                />
              )}
              {page === 'integrations' && <Integrations sales={data.sales} products={data.products} />}
              {page === 'mcp' && <Mcp />}
              {page === 'users' && <UserList users={data.users} refresh={refresh} toast={toast} />}
              {page === 'settings' && <Settings />}
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
    </div>
  );
}
