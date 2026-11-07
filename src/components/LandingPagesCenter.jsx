import React, { useState, useEffect, useRef } from 'react';
import { api, money } from '../services/api';
import { playSaleSound, triggerShopifyTestAlert } from './SaleAlertBanner';
import { 
  Globe, Radio, Eye, Package, TrendingUp, DollarSign, 
  RefreshCw, Plus, ExternalLink, Copy, Check, ShoppingBag, 
  Phone, MapPin, Settings as SettingsIcon, Truck, Volume2, 
  VolumeX, AlertCircle, Clock, CheckCircle2, X, Code, Send
} from 'lucide-react';

let cachedLandingData = (() => {
  try {
    localStorage.removeItem('nexora_landings_cache_v3');
    const raw = localStorage.getItem('nexora_landings_cache_v3');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

export default function LandingPagesCenter({ products = [], toast = () => {} }) {
  const [data, setData] = useState(() => cachedLandingData || { landings: [], totals: { total_active_now: 0, total_visits_today: 0, total_orders_today: 0, total_revenue_today: 0, total_landings: 0 } });
  const [loading, setLoading] = useState(!cachedLandingData);

  const todayStr = (() => {
    try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  })();

  const [period, setPeriod] = useState('today');
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('nexora-sales-alerts') !== 'off');
  const [copiedId, setCopiedId] = useState('');
  
  // Modals
  const [selectedLandingOrders, setSelectedLandingOrders] = useState(null);
  const [selectedLandingConfig, setSelectedLandingConfig] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [catalogProducts, setCatalogProducts] = useState(products || []);
  const [savingMapping, setSavingMapping] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSnippetModal, setShowSnippetModal] = useState(null);

  useEffect(() => {
    if (Array.isArray(products) && products.length > 0) {
      setCatalogProducts(products);
    }
  }, [products]);

  useEffect(() => {
    if (selectedLandingConfig) {
      setProductSearch('');
      api('/catalog?view=list').then(rows => {
        if (Array.isArray(rows) && rows.length > 0) setCatalogProducts(rows);
      }).catch(() => {});
    }
  }, [selectedLandingConfig?.id]);

  // Form states
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [savingLanding, setSavingLanding] = useState(false);

  // Audio synthesizer chime for sale alert
  const prevOrdersCountRef = useRef(null);
  const filterRef = useRef({ period: 'today', from: todayStr, to: todayStr });
  useEffect(() => {
    filterRef.current = { period, from: dateFrom, to: dateTo };
  }, [period, dateFrom, dateTo]);

  const applyPresetPeriod = (nextPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (nextPeriod === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const y = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(d);
      setDateFrom(y);
      setDateTo(y);
    } else if (nextPeriod === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(d);
      setDateFrom(s);
      setDateTo(todayStr);
    } else if (nextPeriod === 'month') {
      setDateFrom(`${todayStr.slice(0, 7)}-01`);
      setDateTo(todayStr);
    } else if (nextPeriod === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const periodSuffix = period === 'today'
    ? 'HOY'
    : period === 'yesterday'
      ? 'AYER'
      : period === '7d'
        ? '7 DÍAS'
        : period === 'month'
          ? 'ESTE MES'
          : period === 'all'
            ? 'TOTAL'
            : 'RANGO';

  const periodLowerLabel = period === 'today'
    ? 'hoy'
    : period === 'yesterday'
      ? 'ayer'
      : period === 'all'
        ? 'total'
        : 'período';

  const loadMetrics = async (silent = false, customFilter = null) => {
    if (!silent && !cachedLandingData) setLoading(true);
    try {
      const f = customFilter || filterRef.current;
      const params = new URLSearchParams();
      params.set('period', f.period || 'today');
      if (f.period === 'custom') {
        if (f.from) params.set('from', f.from);
        if (f.to) params.set('to', f.to);
      }
      const res = await api(`/landings/metrics?${params.toString()}`);
      if (res && res.landings) {
        const totalOrders = res.totals?.total_orders_today || 0;
        prevOrdersCountRef.current = totalOrders;
        if (f.period === 'today') {
          cachedLandingData = res;
          try { localStorage.setItem('nexora_landings_cache_v3', JSON.stringify(res)); } catch {}
        }
        setData(res);
      }
    } catch (e) {
      if (!silent) toast('Error al cargar métricas de landings: ' + e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  
  // Auto-reload metrics when global sale alert fires
  useEffect(() => {
    const handleNewOrder = () => {
      loadMetrics(true);
    };
    window.addEventListener('nexora-order-created', handleNewOrder);
    return () => window.removeEventListener('nexora-order-created', handleNewOrder);
  }, []);

  useEffect(() => {
    loadMetrics(false, { period, from: dateFrom, to: dateTo });
  }, [period, dateFrom, dateTo]);

  // Real-time polling every 6 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadMetrics(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, soundEnabled, period, dateFrom, dateTo]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast('Copiado al portapapeles');
    setTimeout(() => setCopiedId(''), 2000);
  };

  const handleSaveLanding = async (e) => {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) {
      toast('Por favor completa identificador y nombre de la landing');
      return;
    }
    setSavingLanding(true);
    try {
      await api('/landings/register', {
        method: 'POST',
        body: {
          id: newId.trim().toLowerCase(),
          name: newName.trim(),
          url: newUrl.trim() || `https://pidedirecto.cyou/${newId.trim().toLowerCase()}`
        }
      });
      toast(`✅ Landing ${newName} guardada con éxito`);
      setShowAddModal(false);
      setNewId('');
      setNewName('');
      setNewUrl('');
      loadMetrics();
    } catch (e) {
      toast('Error guardando landing: ' + e.message);
    } finally {
      setSavingLanding(false);
    }
  };

  const handleSaveConfig = async (landing) => {
    setSavingMapping(true);
    try {
      const mode = landing.auto_fulfillment || 'dropi';
      const supplierPlatform = mode === 'dropea'
        ? 'Dropea'
        : mode === 'dropi'
          ? 'Dropi'
          : (landing.supplier_platform || 'Dropi');
      const res = await api('/landings/register', {
        method: 'POST',
        body: {
          id: landing.id,
          name: landing.name,
          url: landing.url,
          master_sku: landing.master_sku || `SKU-${String(landing.id || '').toUpperCase()}-01`,
          supplier_platform: supplierPlatform,
          supplier_product_id: landing.supplier_product_id || '',
          auto_fulfillment: mode
        }
      });
      toast(`✅ Sincronizado simultáneamente: Nexora (${res.master_sku || landing.master_sku}) + ${supplierPlatform}${res.supplier_product_id ? ' #' + res.supplier_product_id : ''}`);
      setSelectedLandingConfig(null);
      loadMetrics(true);
    } catch (e) {
      toast('Error actualizando configuración: ' + e.message);
    } finally {
      setSavingMapping(false);
    }
  };

  const handleToggleCampaign = async (landing, resetVisits = false) => {
    if (resetVisits && !window.confirm(`¿Limpiar a 0 todas las visitas de prueba acumuladas en "${landing.name}"?`)) return;
    try {
      const res = await api(`/landings/campaign/${encodeURIComponent(landing.id)}`, {
        method: 'PUT',
        body: resetVisits
          ? { campaign_active: Boolean(landing.campaign_active), reset_visits: true }
          : { toggle: true }
      });
      if (resetVisits) {
        toast(`🧹 Visitas de "${landing.name}" reiniciadas a 0`);
      } else {
        toast(res.campaign_active ? `🟢 "${landing.name}" marcada EN CAMPAÑA (Activa)` : `⚪ "${landing.name}" marcada EN PAUSA`);
      }
      loadMetrics(true);
    } catch (e) {
      toast('Error actualizando estado de landing: ' + e.message);
    }
  };

  const handleDeleteLanding = async (id, name) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el monitoreo de la landing "${name}"?`)) return;
    try {
      await api(`/landings/manage/${encodeURIComponent(id)}`, { method: 'DELETE', body: {} });
      toast(`Landing ${name} eliminada`);
      loadMetrics();
    } catch (e) {
      toast('Error eliminando landing: ' + e.message);
    }
  };

  return (
    <div className="landing-center-wrap" style={{ padding: '0 0 32px 0' }}>
      <style>{`
        @keyframes nexoraPulseDot {
          0% { transform: scale(0.9); opacity: 0.4; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
          100% { transform: scale(0.9); opacity: 0.4; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @keyframes nexoraSignalWave {
          0%, 100% { opacity: 0.35; transform: scale(0.92); filter: drop-shadow(0 0 1px #22c55e); }
          50% { opacity: 1; transform: scale(1.12); filter: drop-shadow(0 0 6px #22c55e); }
        }
        .nx-live-dot {
          animation: nexoraPulseDot 1.4s infinite ease-in-out !important;
        }
        .nx-signal-icon {
          animation: nexoraSignalWave 1.4s infinite ease-in-out !important;
        }

        /* KPI Banner */
        .nx-kpi-banner {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }
        .nx-kpi-item {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          padding: 12px 15px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        [data-theme="night"] .nx-kpi-item {
          background: #16263e !important;
          border-color: #2b3d57 !important;
        }

        /* Landing Card */
        .nx-land-card {
          border-radius: 11px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 15px 17px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.02);
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          gap: 11px;
          transition: border-color 0.15s ease;
        }
        [data-theme="night"] .nx-land-card {
          background: #16263e !important;
          border-color: #2b3d57 !important;
        }
        .nx-land-card:hover {
          border-color: #93c5fd;
        }
        [data-theme="night"] .nx-land-card:hover {
          border-color: #3b82f6 !important;
        }
        .nx-land-card.is-running {
          border: 2px solid #22c55e !important;
          box-shadow: 0 0 18px rgba(34, 197, 94, 0.25), inset 0 0 10px rgba(34, 197, 94, 0.05) !important;
        }
        [data-theme="night"] .nx-land-card.is-running {
          border: 2px solid #22c55e !important;
          background: linear-gradient(180deg, rgba(22, 38, 62, 0.98) 0%, rgba(16, 48, 42, 0.38) 100%) !important;
          box-shadow: 0 0 22px rgba(34, 197, 94, 0.32), inset 0 0 14px rgba(34, 197, 94, 0.08) !important;
        }
        .nx-land-card.is-live-now {
          border: 2px solid #4ade80 !important;
          box-shadow: 0 0 26px rgba(34, 197, 94, 0.45), inset 0 0 16px rgba(34, 197, 94, 0.12) !important;
        }

        /* Sub-box inside landing card */
        .nx-land-subbox {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 9px;
          border-radius: 7px;
          text-align: center;
          margin-bottom: 7px;
        }
        [data-theme="night"] .nx-land-subbox {
          background: #102039 !important;
          border-color: #223753 !important;
        }

        /* Buttons inside card */
        .nx-btn-orders {
          background: #0066ff;
          color: #ffffff;
          border: none;
          border-radius: 5px;
          padding: 0 11px;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 28px;
          transition: background 0.15s ease;
        }
        .nx-btn-orders:hover {
          background: #0052cc;
        }

        .nx-btn-config {
          background: transparent;
          color: #64748b;
          border: 1px solid #cbd5e1;
          border-radius: 5px;
          padding: 0 9px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 28px;
          transition: all 0.15s ease;
        }
        [data-theme="night"] .nx-btn-config {
          color: #94a3b8;
          border-color: #334a69;
        }
        .nx-btn-config:hover {
          color: #0066ff;
          border-color: #0066ff;
          background: rgba(0, 102, 255, 0.08);
        }

        .nx-btn-tiny {
          background: transparent;
          color: #94a3b8;
          border: 1px solid #cbd5e1;
          border-radius: 5px;
          padding: 0 7px;
          font-size: 11px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          opacity: 0.65;
          transition: all 0.15s ease;
        }
        [data-theme="night"] .nx-btn-tiny {
          color: #64748b;
          border-color: #2b3d57;
        }
        .nx-btn-tiny:hover {
          opacity: 1;
          color: #0066ff;
          border-color: #0066ff;
        }

        /* Modal styling */
        .nx-modal-dialog {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #0f172a;
          box-shadow: 0 20px 40px rgba(0,0,0,0.35);
        }
        [data-theme="night"] .nx-modal-dialog {
          background: #16263e !important;
          border-color: #2b3d57 !important;
          color: #ffffff !important;
        }
        .nx-modal-row {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          padding: 10px 13px;
        }
        [data-theme="night"] .nx-modal-row {
          background: #102039 !important;
          border-color: #233854 !important;
        }
        .nx-modal-label {
          color: #475569;
        }
        [data-theme="night"] .nx-modal-label {
          color: #94a3b8 !important;
        }
        .nx-modal-sub {
          color: #64748b;
        }
        [data-theme="night"] .nx-modal-sub {
          color: #cbd5e1 !important;
        }
        /* Typography contrast in Night Mode */
        .nx-land-title {
          color: #0f172a;
        }
        [data-theme="night"] .nx-land-title {
          color: #ffffff !important;
        }

        .nx-land-name {
          color: #0f172a;
        }
        [data-theme="night"] .nx-land-name {
          color: #ffffff !important;
        }

        .nx-subbox-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 0.03em;
        }
        [data-theme="night"] .nx-subbox-label {
          color: #94a3b8 !important;
        }

        .nx-num-visits {
          font-size: 1.25rem;
          font-weight: 800;
          margin-top: 2px;
          color: #16a34a;
        }
        [data-theme="night"] .nx-num-visits {
          color: #22c55e !important;
        }

        .nx-num-white {
          font-size: 1.25rem;
          font-weight: 800;
          margin-top: 2px;
          color: #0f172a;
        }
        [data-theme="night"] .nx-num-white {
          color: #ffffff !important;
        }

        .nx-kpi-num {
          font-size: 1.6rem;
          font-weight: 800;
          margin-top: 2px;
          line-height: 1.1;
          color: #0f172a;
        }
        [data-theme="night"] .nx-kpi-num {
          color: #ffffff !important;
        }

      `}</style>

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Globe size={22} color="#0066ff" />
              Landing Pages
            </h1>
            <span style={{ 
              background: 'rgba(34, 197, 94, 0.12)', 
              color: '#16a34a', 
              fontSize: '0.72rem', 
              fontWeight: 800, 
              padding: '2px 7px', 
              borderRadius: '999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span className="nx-live-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              TIEMPO REAL
            </span>
          </div>
          <p style={{ margin: '2px 0 0 0', color: 'var(--muted, #64748b)', fontSize: '0.8rem' }}>
            Monitoreo en vivo de usuarios activos, visitas hoy, conversiones y pedidos contra entrega desde <b>pidedirecto.cyou</b>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button 
            className="outline" 
            onClick={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem('nexora-sales-alerts', next ? 'on' : 'off'); if (next) { playSaleSound(true); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {} } }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '5px 9px' }}
            title={soundEnabled ? 'Sonido de venta activado' : 'Sonido silenciado'}
          >
            {soundEnabled ? <Volume2 size={13} color="#16a34a" /> : <VolumeX size={13} color="#94a3b8" />}
            {soundEnabled ? 'Sonido ON' : 'Silencio'}
          </button>

          <button
            className="outline"
            onClick={() => triggerShopifyTestAlert()}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '5px 9px', borderColor: 'rgba(16, 185, 129, 0.45)', color: '#10b981' }}
            title="Probar sonido Cha-Ching de Shopify + Notificaci?n nativa de Windows"
          >
            ?? Probar Cha-Ching
          </button>

          <button 
            className="outline" 
            onClick={() => loadMetrics()} 
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '5px 9px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            Actualizar
          </button>

          {/* Sutil botón de snippet en la barra superior con tooltip */}
          <button 
            className="outline" 
            onClick={() => setShowSnippetModal({ id: 'aerosleep', name: 'General' })}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', padding: '5px 9px', color: 'var(--muted, #64748b)' }}
            title="Ver snippet de integración y código JS para tu landing"
          >
            <Code size={13} />
            Snippet JS
          </button>

          <button 
            className="btnPrimary" 
            onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#0066ff', color: '#fff', padding: '5px 12px', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            <Plus size={14} />
            Registrar Landing
          </button>
        </div>
      </div>

      {/* Date / Period Filter Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '10px 14px',
        marginBottom: '14px',
        borderRadius: '9px',
        background: 'rgba(15, 23, 42, 0.35)',
        border: '1px solid var(--border, #2b3d57)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Clock size={14} color="#3b82f6" />
          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted, #94a3b8)', marginRight: '4px' }}>
            Filtrar período:
          </span>
          {[
            ['today', 'Hoy'],
            ['yesterday', 'Ayer'],
            ['7d', '7 días'],
            ['month', 'Este mes'],
            ['all', 'Todo']
          ].map(([id, labelText]) => {
            const active = period === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => applyPresetPeriod(id)}
                style={{
                  padding: '5px 11px',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1px solid #0066ff' : '1px solid rgba(148,163,184,0.25)',
                  background: active ? '#0066ff' : 'transparent',
                  color: active ? '#ffffff' : 'inherit',
                  transition: 'all 0.15s ease'
                }}
              >
                {labelText}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted, #94a3b8)' }}>
            Desde:
            <input
              type="date"
              value={dateFrom}
              max={dateTo || todayStr}
              onChange={(e) => {
                const v = e.target.value;
                setDateFrom(v);
                if (!dateTo) setDateTo(todayStr);
                setPeriod('custom');
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: period === 'custom' ? '1px solid #3b82f6' : '1px solid rgba(148,163,184,0.3)',
                fontSize: '0.76rem',
                fontWeight: 600
              }}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted, #94a3b8)' }}>
            Hasta:
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              max={todayStr}
              onChange={(e) => {
                const v = e.target.value;
                setDateTo(v);
                if (!dateFrom) setDateFrom(v);
                setPeriod('custom');
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: period === 'custom' ? '1px solid #3b82f6' : '1px solid rgba(148,163,184,0.3)',
                fontSize: '0.76rem',
                fontWeight: 600
              }}
            />
          </label>
          {period === 'custom' && (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '999px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa'
            }}>
              {dateFrom} → {dateTo}
            </span>
          )}
        </div>
      </div>

      {/* Global Highlights Banner */}
      <div className="nx-kpi-banner">
        <div className="nx-kpi-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted, #64748b)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>USUARIOS EN VIVO</span>
            <Radio className="nx-signal-icon" size={15} color="#22c55e" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2px', color: '#16a34a', display: 'flex', alignItems: 'baseline', gap: '7px', lineHeight: 1.1 }}>
            <span className="nx-live-dot" style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', alignSelf: 'center' }} />
            {data.totals?.total_active_now || 0}
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted, #64748b)' }}>activos ahora</span>
          </div>
          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {(data.landings || []).filter(l => l.active_now > 0).length > 0 ? (
              (data.landings || []).filter(l => l.active_now > 0).map(l => (
                <span key={l.id} style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: '999px',
                  background: 'rgba(34, 197, 94, 0.16)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.35)'
                }}>
                  🟢 {l.name.split('·')[0].trim()}: {l.active_now}
                </span>
              ))
            ) : (
              <span style={{ fontSize: '0.68rem', color: 'var(--muted, #64748b)' }}>
                Sin visitantes activos en los últimos 3 min
              </span>
            )}
          </div>
        </div>

        <div className="nx-kpi-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted, #64748b)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>VISITAS ({periodSuffix})</span>
            <Eye size={15} color="#3b82f6" />
          </div>
          <div className="nx-kpi-num">
            {data.totals?.total_visits_today || 0}
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted, #64748b)', marginLeft: '5px' }}>únicas</span>
          </div>
        </div>

        <div className="nx-kpi-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted, #64748b)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>PEDIDOS {periodSuffix} (COD)</span>
            <Package size={15} color="#f59e0b" />
          </div>
          <div className="nx-kpi-num">
            {data.totals?.total_orders_today || 0}
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted, #64748b)', marginLeft: '5px' }}>órdenes</span>
          </div>
        </div>

        <div className="nx-kpi-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted, #64748b)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>FACTURACIÓN ({periodSuffix})</span>
            <DollarSign size={15} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2px', color: '#10b981', lineHeight: 1.1 }}>
            {money(data.totals?.total_revenue_today || 0)}
          </div>
        </div>
      </div>

      {/* Landings Grid Header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 className="nx-land-title" style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>
          Landings Conectadas ({data.landings?.length || 0})
        </h2>
      </div>

      {(!loading && data.landings?.length === 0) ? (
        <div className="nx-land-card" style={{ textAlign: 'center', padding: '40px 20px', borderStyle: 'dashed' }}>
          <Globe size={40} color="var(--muted, #94a3b8)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem' }}>No hay landing pages registradas todavía</h3>
          <p style={{ margin: '0 0 14px 0', color: 'var(--muted, #64748b)', fontSize: '0.85rem' }}>
            Registra tu primera landing alojada en <b>pidedirecto.cyou</b> para comenzar a recibir visitas en vivo y pedidos contra entrega.
          </p>
          <button 
            className="btnPrimary"
            onClick={() => setShowAddModal(true)}
            style={{ background: '#0066ff', color: '#fff', padding: '6px 15px', borderRadius: '6px', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Registrar Landing
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px' }}>
          {[...data.landings].sort((a, b) => {
            const aCamp = a.campaign_active ? 10000 : 0;
            const bCamp = b.campaign_active ? 10000 : 0;
            const aLive = a.active_now > 0 ? 500 : 0;
            const bLive = b.active_now > 0 ? 500 : 0;
            return (bCamp + bLive) - (aCamp + aLive) || (b.visits_today || 0) - (a.visits_today || 0);
          }).map(landing => {
            const isRunning = Boolean(landing.campaign_active);
            const isLiveNow = landing.active_now > 0;
            return (
              <div 
                key={landing.id} 
                className={`nx-land-card${isRunning ? ' is-running' : ''}${isRunning && isLiveNow ? ' is-live-now' : ''}`}
              >
                {/* Header of Card */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                      <Globe size={18} color={isRunning ? '#22c55e' : '#0066ff'} />
                      <h3 className="nx-land-name" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                        {landing.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleToggleCampaign(landing, false)}
                        title={isRunning ? 'Clic para pausar campaña (quitar contorno verde)' : 'Clic para marcar esta landing EN CAMPAÑA (activar contorno verde)'}
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          cursor: 'pointer',
                          background: isRunning ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.12)',
                          color: isRunning ? '#4ade80' : '#94a3b8',
                          border: isRunning ? '1px solid rgba(34, 197, 94, 0.55)' : '1px solid rgba(148, 163, 184, 0.28)',
                          letterSpacing: '0.02em',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isRunning ? '🟢 EN CAMPAÑA' : '⚪ Activar Campaña'}
                      </button>
                    </div>

                    {/* Green Live Pill */}
                    <div style={{ 
                      background: landing.active_now > 0 ? 'rgba(34, 197, 94, 0.14)' : 'rgba(148, 163, 184, 0.12)', 
                      color: landing.active_now > 0 ? '#16a34a' : '#64748b', 
                      fontSize: '0.74rem', 
                      fontWeight: 700, 
                      padding: '2px 8px', 
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      whiteSpace: 'nowrap'
                    }}>
                      <span className={landing.active_now > 0 ? "nx-live-dot" : ""} style={{ 
                        width: '7px', 
                        height: '7px', 
                        borderRadius: '50%', 
                        background: landing.active_now > 0 ? '#22c55e' : '#94a3b8'
                      }} />
                      {landing.active_now} {landing.active_now === 1 ? 'en vivo' : 'en vivo'}
                    </div>
                  </div>

                  {/* URL Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--muted, #64748b)', marginBottom: '10px' }}>
                    <span>URL:</span>
                    <a 
                      href={landing.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ color: '#0066ff', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {landing.url.replace(/^https?:\/\//, '')}
                      <ExternalLink size={10} />
                    </a>
                    <button 
                      onClick={() => handleCopy(landing.url, landing.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted, #94a3b8)', padding: '1px 3px' }}
                      title="Copiar URL"
                    >
                      {copiedId === landing.id ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    </button>
                  </div>

                  {/* Metrics Row: 3 columns box con Visitas en verde y Pedidos / Conv en blanco */}
                  <div className="nx-land-subbox">
                    <div>
                      <div className="nx-subbox-label">
                        Visitas {periodLowerLabel}
                      </div>
                      <div className="nx-num-visits">
                        {landing.visits_today}
                      </div>
                    </div>

                    <div style={{ borderLeft: '1px solid var(--border, #cbd5e1)', borderRight: '1px solid var(--border, #cbd5e1)' }}>
                      <div className="nx-subbox-label">
                        Pedidos
                      </div>
                      <div className="nx-num-white">
                        {landing.orders_today}
                      </div>
                    </div>

                    <div>
                      <div className="nx-subbox-label">
                        Conv.
                      </div>
                      <div className="nx-num-white">
                        {landing.conversion_rate}%
                      </div>
                    </div>
                  </div>

                  {/* Facturación */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--muted, #64748b)', fontWeight: 600 }}>Facturación {periodLowerLabel}:</span>
                    <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#16a34a' }}>
                      {money(landing.revenue_today)} CLP
                    </span>
                  </div>

                  {/* Producto / SKU Maestro asignado */}
                  <div style={{
                    marginTop: '6px',
                    padding: '6px 9px',
                    borderRadius: '6px',
                    background: 'rgba(2, 132, 199, 0.08)',
                    border: '1px solid rgba(2, 132, 199, 0.2)',
                    fontSize: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ color: '#38bdf8', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Package size={12} />
                      SKU: {landing.master_sku || 'Sin asignar'}
                    </span>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                      {landing.supplier_product_id
                        ? `${landing.supplier_platform || 'Dropi'} #${landing.supplier_product_id}`
                        : (landing.auto_fulfillment === 'dropi' ? 'Dropi Chile' : landing.auto_fulfillment === 'dropea' ? 'Dropea COD' : 'Empaque local')}
                    </span>
                  </div>
                </div>

                {/* Card Actions: botones compactos, discretos y modernos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border, #f1f5f9)' }}>
                  <button 
                    className="nx-btn-orders" 
                    onClick={() => setSelectedLandingOrders(landing)}
                    style={{ flex: 1 }}
                  >
                    <ShoppingBag size={13} />
                    Pedidos ({landing.orders_today})
                  </button>

                  <button 
                    className="nx-btn-config" 
                    onClick={() => setSelectedLandingConfig({ ...landing })}
                    title="Asignar Producto de Nexora y ID de Dropi/Dropea"
                  >
                    <SettingsIcon size={12} />
                    Mapeo
                  </button>

                  {/* Botón de tracking chiquito y discreto */}
                  <button
                    className="nx-btn-tiny"
                    onClick={() => handleToggleCampaign(landing, true)}
                    title="Limpiar visitas de prueba acumuladas a 0"
                  >
                    <RefreshCw size={12} />
                  </button>

                  <button 
                    className="nx-btn-tiny" 
                    onClick={() => setShowSnippetModal(landing)}
                    title="Código de tracking de esta landing"
                  >
                    <Code size={13} />
                  </button>

                  <button
                    className="nx-btn-tiny"
                    onClick={() => handleDeleteLanding(landing.id, landing.name)}
                    title="Eliminar esta landing"
                    style={{ color: '#ef4444' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Ver Pedidos Entrantes */}
      {selectedLandingOrders && (
        <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="nx-modal-dialog" style={{ maxWidth: '820px', width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '14px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: '12px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={20} color="#0066ff" />
                  Pedidos Entrantes · {selectedLandingOrders.name}
                </h3>
                <span className="nx-modal-label" style={{ fontSize: '0.8rem' }}>
                  {selectedLandingOrders.orders_total} pedidos recibidos en total ({selectedLandingOrders.orders_today} hoy)
                </span>
              </div>
              <button onClick={() => setSelectedLandingOrders(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'inherit' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              {(!selectedLandingOrders.recent_orders || selectedLandingOrders.recent_orders.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted, #64748b)' }}>
                  <ShoppingBag size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600 }}>No hay pedidos contra entrega registrados aún para esta landing.</p>
                  <small style={{ fontSize: '0.78rem' }}>Los pedidos enviados desde el formulario de pidedirecto.cyou aparecerán aquí en tiempo real.</small>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedLandingOrders.recent_orders.map(order => (
                    <div 
                      key={order.id} 
                      className="nx-modal-row"
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        flexWrap: 'wrap', 
                        gap: '10px' 
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                          <span style={{ fontWeight: 800, color: '#0066ff', fontSize: '0.95rem' }}>#{order.order_number || 'COD'}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{order.customer_name}</span>
                          <span style={{ fontSize: '0.72rem', background: 'rgba(0,102,255,0.1)', color: '#0066ff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            {order.pack_selected || '1 Unidad'}
                          </span>
                        </div>
                        <div className="nx-modal-sub" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Phone size={12} />
                            <a href={`https://wa.me/${order.customer_phone?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 700 }}>
                              {order.customer_phone}
                            </a>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} />
                            {order.customer_commune || 'Comuna'}, {order.customer_region || 'RM'}
                          </span>
                          <span>
                            {new Date(order.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>
                          {money(order.total_price)}
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#d97706', background: 'rgba(217, 119, 6, 0.15)', padding: '2px 7px', borderRadius: '4px' }}>
                          {order.status || 'PENDIENTE'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border, #e2e8f0)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btnPrimary" onClick={() => setSelectedLandingOrders(null)} style={{ background: '#0066ff', color: '#fff', padding: '6px 14px', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configurar Producto + Dropea / Dropi */}
      {selectedLandingConfig && (() => {
        const list = catalogProducts.length > 0 ? catalogProducts : (products || []);
        const q = productSearch.trim().toLowerCase();
        const filteredProducts = list.filter(p => {
          if (!q) return true;
          const dropiCode = String(p.codes?.Dropi || '');
          const dropeaCode = String(p.codes?.Dropea || '');
          return (
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.sku || '').toLowerCase().includes(q) ||
            dropiCode.toLowerCase().includes(q) ||
            dropeaCode.toLowerCase().includes(q)
          );
        });

        const selectNexoraProduct = (prod) => {
          const dropiCode = prod.codes?.Dropi ? String(prod.codes.Dropi) : '';
          const dropeaCode = prod.codes?.Dropea ? String(prod.codes.Dropea) : '';
          const nextMode = dropiCode
            ? 'dropi'
            : dropeaCode
              ? 'dropea'
              : (selectedLandingConfig.auto_fulfillment && selectedLandingConfig.auto_fulfillment !== 'none'
                  ? selectedLandingConfig.auto_fulfillment
                  : 'dropi');
          const nextSupplierPlatform = nextMode === 'dropea' ? 'Dropea' : 'Dropi';
          const nextSupplierId = nextMode === 'dropea'
            ? (dropeaCode || selectedLandingConfig.supplier_product_id || '')
            : (dropiCode || selectedLandingConfig.supplier_product_id || '');

          setSelectedLandingConfig({
            ...selectedLandingConfig,
            master_sku: prod.sku,
            supplier_platform: nextSupplierPlatform,
            supplier_product_id: nextSupplierId,
            auto_fulfillment: nextMode
          });
        };

        return (
        <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="nx-modal-dialog" style={{ maxWidth: '600px', width: '100%', borderRadius: '14px', padding: '22px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Truck size={19} color="#0066ff" />
                  Asignar Producto y Despacho · {selectedLandingConfig.name}
                </h3>
                <small className="nx-modal-label" style={{ fontSize: '0.76rem' }}>
                  Sincroniza a la vez tu producto de <b>Nexora ERP</b> y el ID de <b>Dropi Chile</b> o <b>Dropea COD</b>
                </small>
              </div>
              <button onClick={() => setSelectedLandingConfig(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                <X size={17} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {/* Paso 1: Buscador y Lista Visual de Productos en Nexora */}
              <div>
                <label className="nx-modal-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                  1. Seleccionar Producto de tu Catálogo Nexora ({list.length} productos)
                </label>

                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="🔍 Buscar producto por nombre, SKU Maestro (ej: NEX-00200) o ID Dropi..."
                  style={{
                    width: '100%',
                    padding: '8px 11px',
                    borderRadius: '7px',
                    border: '1px solid #3b82f6',
                    fontSize: '0.83rem',
                    marginBottom: '8px',
                    background: '#0f1f38',
                    color: '#f8fafc'
                  }}
                />

                <div style={{
                  maxHeight: '185px',
                  overflowY: 'auto',
                  border: '1px solid #2b3d57',
                  borderRadius: '8px',
                  background: '#0b172a',
                  padding: '5px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {filteredProducts.length === 0 ? (
                    <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                      No se encontraron productos con "{productSearch}". Puedes ingresar el ID de Dropi abajo y se importará automáticamente a Nexora.
                    </div>
                  ) : (
                    filteredProducts.map(p => {
                      const isSelected = selectedLandingConfig.master_sku === p.sku;
                      const avail = (p.stock || 0) - (p.reserved || 0);
                      const dropiCode = p.codes?.Dropi;
                      const dropeaCode = p.codes?.Dropea;
                      return (
                        <button
                          key={p.id || p.sku}
                          type="button"
                          onClick={() => selectNexoraProduct(p)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                            background: isSelected ? 'rgba(59, 130, 246, 0.22)' : 'rgba(22, 38, 62, 0.65)',
                            color: '#f8fafc',
                            transition: 'all 0.12s ease'
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.83rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                                {p.sku}
                              </span>
                              {dropiCode && (
                                <span style={{ fontSize: '0.71rem', fontWeight: 700, color: '#f97316', background: 'rgba(249, 115, 22, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                                  Dropi #{dropiCode}
                                </span>
                              )}
                              {dropeaCode && (
                                <span style={{ fontSize: '0.71rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168, 85, 247, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                                  Dropea #{dropeaCode}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span style={{
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: avail > 0 ? 'rgba(34, 197, 94, 0.16)' : 'rgba(148, 163, 184, 0.15)',
                              color: avail > 0 ? '#4ade80' : '#94a3b8'
                            }}>
                              Stock: {avail}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Paso 2: Selección de Proveedor Simultáneo (Dropi o Dropea) */}
              <div>
                <label className="nx-modal-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                  2. Plataforma vinculada simultáneamente con Nexora:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    ['dropi', 'Dropi', '⚡ Nexora + Dropi Chile', 'Vincula SKU Maestro y Dropi #ID a la vez'],
                    ['dropea', 'Dropea', '🚚 Nexora + Dropea COD', 'Vincula SKU Maestro y Dropea #ID a la vez'],
                    ['none', 'Nexora', '📦 Solo Bodega Nexora', 'Empaque propio en local']
                  ].map(([modeId, platName, titleText, subText]) => {
                    const active = (selectedLandingConfig.auto_fulfillment || 'dropi') === modeId;
                    return (
                      <button
                        key={modeId}
                        type="button"
                        onClick={() => setSelectedLandingConfig({
                          ...selectedLandingConfig,
                          auto_fulfillment: modeId,
                          supplier_platform: platName
                        })}
                        style={{
                          padding: '9px 10px',
                          borderRadius: '8px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          border: active ? '2px solid #0066ff' : '1px solid #2b3d57',
                          background: active ? 'rgba(0, 102, 255, 0.16)' : 'rgba(16, 32, 57, 0.7)',
                          color: '#ffffff'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.78rem', color: active ? '#60a5fa' : '#f8fafc' }}>
                          {titleText}
                        </div>
                        <small style={{ fontSize: '0.69rem', color: '#94a3b8', display: 'block', marginTop: '2px', lineHeight: 1.25 }}>
                          {subText}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paso 3: Campos sincronizados SKU Maestro + ID Proveedor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '11px', borderRadius: '8px', background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <div>
                  <label className="nx-modal-label" style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: '4px', color: '#38bdf8' }}>
                    SKU Maestro en Nexora
                  </label>
                  <input
                    type="text"
                    value={selectedLandingConfig.master_sku || ''}
                    onChange={e => setSelectedLandingConfig({ ...selectedLandingConfig, master_sku: e.target.value })}
                    placeholder="Ej: NEX-00200"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #2b3d57', fontSize: '0.84rem', background: '#0f1f38', color: '#ffffff', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label className="nx-modal-label" style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: '4px', color: '#fb923c' }}>
                    ID Producto en {selectedLandingConfig.auto_fulfillment === 'dropea' ? 'Dropea COD' : 'Dropi Chile'}
                  </label>
                  <input
                    type="text"
                    value={selectedLandingConfig.supplier_product_id || ''}
                    onChange={e => {
                      const val = e.target.value;
                      const currentMode = selectedLandingConfig.auto_fulfillment === 'none' ? 'dropi' : (selectedLandingConfig.auto_fulfillment || 'dropi');
                      setSelectedLandingConfig({
                        ...selectedLandingConfig,
                        supplier_product_id: val,
                        supplier_platform: currentMode === 'dropea' ? 'Dropea' : 'Dropi',
                        auto_fulfillment: val ? currentMode : selectedLandingConfig.auto_fulfillment
                      });
                    }}
                    placeholder={selectedLandingConfig.auto_fulfillment === 'dropea' ? 'Ej: 10482' : 'Ej: 189500 (Auto-sincroniza)'}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #2b3d57', fontSize: '0.84rem', background: '#0f1f38', color: '#ffffff', fontWeight: 700 }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', fontSize: '0.73rem', color: '#94a3b8' }}>
                  💡 <b>Sincronización doble automática:</b> Al guardar, este vínculo se asigna tanto en la <b>Landing Page</b> como en el <b>Producto de Nexora (SKU Maestro)</b>. Si pones un ID de Dropi que aún no está en tu catálogo, Nexora lo importa y vincula automáticamente.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="outline" onClick={() => setSelectedLandingConfig(null)} style={{ padding: '7px 13px', fontSize: '0.8rem' }}>
                Cancelar
              </button>
              <button
                className="btnPrimary"
                disabled={savingMapping}
                onClick={() => handleSaveConfig(selectedLandingConfig)}
                style={{ background: '#0066ff', color: '#fff', padding: '7px 16px', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                {savingMapping ? 'Sincronizando…' : 'Guardar y Sincronizar (Nexora + Dropi/Dropea)'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal: Registrar Nueva Landing */}
      {showAddModal && (
        <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <form onSubmit={handleSaveLanding} className="nx-modal-dialog" style={{ maxWidth: '460px', width: '100%', borderRadius: '14px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                Registrar Nueva Landing
              </h3>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                <X size={17} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
              <div>
                <label className="nx-modal-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '3px' }}>
                  Identificador / Slug (ej: aerosleep, flexwalk)
                </label>
                <input 
                  type="text" 
                  placeholder="aerosleep" 
                  value={newId} 
                  onChange={e => {
                    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '');
                    setNewId(val);
                    if (!newUrl || newUrl.includes('pidedirecto.cyou')) {
                      setNewUrl(`https://pidedirecto.cyou/${val}`);
                    }
                  }} 
                  required 
                  style={{ width: '100%', padding: '8px 11px', borderRadius: '6px', border: '1px solid var(--border, #cbd5e1)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label className="nx-modal-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '3px' }}>
                  Nombre Comercial del Producto
                </label>
                <input 
                  type="text" 
                  placeholder="AeroSleep™ Bandas Nasales" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '8px 11px', borderRadius: '6px', border: '1px solid var(--border, #cbd5e1)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label className="nx-modal-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '3px' }}>
                  URL Pública de la Landing
                </label>
                <input 
                  type="url" 
                  placeholder="https://pidedirecto.cyou/aerosleep" 
                  value={newUrl} 
                  onChange={e => setNewUrl(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '8px 11px', borderRadius: '6px', border: '1px solid var(--border, #cbd5e1)', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="outline" onClick={() => setShowAddModal(false)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Cancelar
              </button>
              <button type="submit" className="btnPrimary" disabled={savingLanding} style={{ background: '#0066ff', color: '#fff', padding: '6px 14px', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                {savingLanding ? 'Guardando…' : 'Crear Landing'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Snippet de Integración */}
      {showSnippetModal && (
        <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="nx-modal-dialog" style={{ maxWidth: '640px', width: '100%', borderRadius: '14px', padding: '22px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Code size={19} color="#0066ff" />
                Snippet para {showSnippetModal.name || 'tu Landing'}
              </h3>
              <button onClick={() => setShowSnippetModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                <X size={17} />
              </button>
            </div>

            <p className="nx-modal-sub" style={{ margin: '0 0 12px 0', fontSize: '0.84rem' }}>
              Pega este script en tu landing (alojada en <b>pidedirecto.cyou</b>) antes del cierre de <code>&lt;/body&gt;</code> para enviar visitas y pedidos automáticamente a Nexora:
            </p>

            {/* Step 1: Script Tag */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <small style={{ fontWeight: 700 }}>1. Script de Tracking (Pings en Tiempo Real)</small>
                <button 
                  onClick={() => handleCopy(`<script src="https://nexora.wentixai.cyou/api/landings/tracker.js" data-landing="${showSnippetModal.id || 'aerosleep'}"></script>`, 'snip1')}
                  style={{ background: 'none', border: 'none', color: '#0066ff', fontSize: '0.76rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  {copiedId === 'snip1' ? '¡Copiado!' : 'Copiar Script'}
                </button>
              </div>
              <pre style={{ background: '#0a1526', color: '#38bdf8', padding: '11px', borderRadius: '7px', fontSize: '0.8rem', overflowX: 'auto', margin: 0, border: '1px solid #1e3a5f' }}>
{`<script src="https://nexora.wentixai.cyou/api/landings/tracker.js" data-landing="${showSnippetModal.id || 'aerosleep'}"></script>`}
              </pre>
            </div>

            {/* Step 2: Form submit code */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <small style={{ fontWeight: 700 }}>2. Envío de Pedido Contra Entrega (Form Submit)</small>
                <button 
                  onClick={() => handleCopy(`window.nexoraSubmitCODOrder({
  product_name: "${showSnippetModal.name || 'AeroSleep™ Bandas Nasales'}",
  pack_selected: "2 Unidades (Ahorro)",
  total_price: 29990,
  customer: {
    full_name: document.getElementById('name').value,
    phone: document.getElementById('phone').value,
    address: document.getElementById('address').value,
    commune: document.getElementById('commune').value,
    region: "Región Metropolitana"
  }
}).then(res => console.log('Pedido recibido en Nexora:', res));`, 'snip2')}
                  style={{ background: 'none', border: 'none', color: '#0066ff', fontSize: '0.76rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  {copiedId === 'snip2' ? '¡Copiado!' : 'Copiar Código JS'}
                </button>
              </div>
              <pre style={{ background: '#0a1526', color: '#e2e8f0', padding: '11px', borderRadius: '7px', fontSize: '0.78rem', overflowX: 'auto', margin: 0, lineHeight: 1.45, border: '1px solid #1e3a5f' }}>
{`// Al confirmar el formulario contra entrega en pidedirecto.cyou:
window.nexoraSubmitCODOrder({
  product_name: "${showSnippetModal.name || 'AeroSleep™ Bandas Nasales'}",
  pack_selected: "2 Unidades (Ahorro)",
  total_price: 29990,
  customer: {
    full_name: document.getElementById('name').value,
    phone: document.getElementById('phone').value,
    address: document.getElementById('address').value,
    commune: document.getElementById('commune').value,
    region: "Región Metropolitana"
  }
}).then(res => {
  // Pedido registrado exitosamente en Nexora ERP
  console.log('Orden #' + res.order_number + ' creada con éxito');
});`}
              </pre>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btnPrimary" onClick={() => setShowSnippetModal(null)} style={{ background: '#0066ff', color: '#fff', padding: '6px 14px', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
