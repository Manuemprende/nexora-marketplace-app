import React, { useState, useEffect } from 'react';
import { api, money } from '../services/api';
import { 
  ShoppingBag, Truck, Send, Search, Filter, RefreshCw, 
  ExternalLink, Phone, MapPin, CheckCircle2, Clock, AlertTriangle, 
  Settings as SettingsIcon, Package, Copy, Check, MessageSquare, 
  SlidersHorizontal, X, ArrowUpRight, ShieldCheck, ChevronRight, Pencil
} from 'lucide-react';


const GOOGLE_MAPS_API_KEY = 'AIzaSyDrVvrPxwriqLCapp7sVEQ3w-teMSlroqQ';
const GMAPS_CACHE_KEY = 'nexora_gmaps_geo_cache_v1';

function loadGmapsCache() {
  try {
    const raw = localStorage.getItem(GMAPS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGmapsCache(cacheObj) {
  try {
    localStorage.setItem(GMAPS_CACHE_KEY, JSON.stringify(cacheObj));
  } catch {}
}

async function validateAddressWithGoogle(address, commune, region) {
  const cleanAddr = (address || '').trim();
  const cleanComm = (commune || '').trim();
  if (!cleanAddr) {
    return { status: 'missing', label: 'Sin dirección', formatted: '', exact: false };
  }
  const queryKey = `${cleanAddr}|${cleanComm}`.toLowerCase();
  const cache = loadGmapsCache();
  if (cache[queryKey]) return cache[queryKey];

  try {
    const fullQuery = `${cleanAddr}, ${cleanComm}, ${region || 'Chile'}, Chile`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullQuery)}&key=${GOOGLE_MAPS_API_KEY}&language=es&region=cl`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const r = data.results[0];
      const comps = r.address_components || [];
      const types = comps.flatMap(c => c.types || []);
      const hasStreetNumber = types.includes('street_number');
      const hasRoute = types.includes('route');
      const locType = r.geometry?.location_type || '';
      const postalComp = comps.find(c => (c.types || []).includes('postal_code'));
      const postalCode = postalComp ? postalComp.long_name : '';
      const isExact = (hasStreetNumber && hasRoute) || (locType === 'ROOFTOP' && !r.partial_match) || (locType === 'RANGE_INTERPOLATED' && hasRoute && !r.partial_match);

      const result = {
        status: isExact ? 'valid' : 'approx',
        exact: isExact,
        label: isExact ? 'Dirección Validada' : 'Dirección Aproximada',
        formatted: r.formatted_address || fullQuery,
        postalCode,
        locationType: locType,
        lat: r.geometry?.location?.lat || null,
        lng: r.geometry?.location?.lng || null,
        partialMatch: Boolean(r.partial_match)
      };
      cache[queryKey] = result;
      saveGmapsCache(cache);
      return result;
    } else {
      const result = { status: 'invalid', exact: false, label: 'No encontrada', formatted: '', lat: null, lng: null };
      cache[queryKey] = result;
      saveGmapsCache(cache);
      return result;
    }
  } catch (e) {
    return { status: 'error', exact: false, label: 'Pendiente validar', formatted: '' };
  }
}

const STATUS_CONFIG = {
  pending: { label: 'Pendiente Confirmación', color: '#f59e0b', bg: '#fef3c7', nightBg: '#3d2b14', nightColor: '#fcd34d', icon: Clock },
  confirmed: { label: 'Confirmado WhatsApp', color: '#0284c7', bg: '#e0f2fe', nightBg: '#102e4d', nightColor: '#7dd3fc', icon: MessageSquare },
  paid: { label: 'Pagado (Anticipado)', color: '#10b981', bg: '#d1fae5', nightBg: '#064e3b', nightColor: '#6ee7b7', icon: CheckCircle2 },
  sent_to_supplier: { label: 'Enviado a Proveedor', color: '#8b5cf6', bg: '#ede9fe', nightBg: '#2a1b4e', nightColor: '#c4b5fd', icon: Send },
  shipped: { label: 'En Reparto (Guía)', color: '#2563eb', bg: '#dbeafe', nightBg: '#162b50', nightColor: '#93c5fd', icon: Truck },
  delivered: { label: 'Entregado (Cobrado)', color: '#16a34a', bg: '#dcfce7', nightBg: '#133527', nightColor: '#86efac', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: '#dc2626', bg: '#fee2e2', nightBg: '#3b161f', nightColor: '#fca5a5', icon: AlertTriangle }
};

let cachedOrdersData = (() => {
  try {
    localStorage.removeItem('nexora_landing_orders_cache_v3'); const raw = localStorage.getItem('nexora_landing_orders_cache_v3');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

export default function LandingOrdersPage({ toast = () => {} }) {
  const [orders, setOrders] = useState(() => cachedOrdersData?.orders || []);
  const [landings, setLandings] = useState(() => cachedOrdersData?.landings || []);
  const [total, setTotal] = useState(() => cachedOrdersData?.total || 0);
  const [loading, setLoading] = useState(!cachedOrdersData);

  // Filters
  const [selectedLanding, setSelectedLanding] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');

  // Modals & Action states
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [geoResults, setGeoResults] = useState(() => loadGmapsCache());
  const [savingEdit, setSavingEdit] = useState(false);
  const [sendingOrderId, setSendingOrderId] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  // Mapping Form State
  const [mappings, setMappings] = useState([]);
  const [savingMapping, setSavingMapping] = useState(false);

  const loadOrders = async (silent = false) => {
    if (!silent && !cachedOrdersData) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedLanding !== 'all') params.set('landing_id', selectedLanding);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');

      const res = await api(`/landings/all-orders?${params.toString()}`);
      if (res) {
        cachedOrdersData = res;
        try { localStorage.setItem('nexora_landing_orders_cache_v3', JSON.stringify(res)); } catch {}
        setOrders(res.orders || []);
        setTotal(res.total || 0);
        if (res.landings) {
          setLandings(res.landings);
          setMappings(res.landings.map(l => ({ ...l })));
        }
      }
    } catch (e) {
      if (!silent) toast('Error al cargar pedidos: ' + e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  
  // Auto-reload orders when global sale alert fires
  useEffect(() => {
    const handleNewOrder = () => {
      loadOrders(true);
    };
    window.addEventListener('nexora-order-created', handleNewOrder);
    return () => window.removeEventListener('nexora-order-created', handleNewOrder);
  }, [selectedLanding, selectedStatus, search]);

  useEffect(() => {
    loadOrders(Boolean(cachedOrdersData));
  }, [selectedLanding, selectedStatus]);

  // Validate addresses automatically via Google Maps Geocoding API
  useEffect(() => {
    let cancelled = false;
    async function runGeoValidation() {
      const currentCache = loadGmapsCache();
      let updated = false;
      for (const o of orders.slice(0, 30)) {
        if (cancelled) break;
        const key = `${(o.customer_address || '').trim()}|${(o.customer_commune || '').trim()}`.toLowerCase();
        if (o.customer_address && !currentCache[key]) {
          const res = await validateAddressWithGoogle(o.customer_address, o.customer_commune, o.customer_region);
          currentCache[key] = res;
          updated = true;
        }
      }
      if (!cancelled && updated) {
        setGeoResults({ ...currentCache });
      }
    }
    if (orders.length > 0) {
      runGeoValidation();
    }
    return () => { cancelled = true; };
  }, [orders]);

  const getOrderGeo = (order) => {
    if (!order || !order.customer_address) return null;
    const key = `${(order.customer_address || '').trim()}|${(order.customer_commune || '').trim()}`.toLowerCase();
    return geoResults[key] || null;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdatingStatusId(orderId);
    try {
      await api(`/landings/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        body: { status: newStatus }
      });
      toast(`Estado actualizado a: ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      await loadOrders(true);
    } catch (e) {
      toast('Error actualizando estado: ' + e.message);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSaveOrderEdit = async (e) => {
    e?.preventDefault();
    if (!editingOrder) return;
    setSavingEdit(true);
    try {
      await api(`/landings/orders/${encodeURIComponent(editingOrder.id)}`, {
        method: 'PUT',
        body: {
          customer_name: editingOrder.customer_name,
          customer_phone: editingOrder.customer_phone,
          customer_address: editingOrder.customer_address,
          customer_commune: editingOrder.customer_commune,
          customer_region: editingOrder.customer_region,
          pack_selected: editingOrder.pack_selected,
          total_price: editingOrder.total_price,
          master_sku: editingOrder.master_sku,
          supplier_platform: editingOrder.supplier_platform,
          supplier_product_id: editingOrder.supplier_product_id,
          status: editingOrder.status,
          guide_number: editingOrder.guide_number
        }
      });
      toast('✅ Pedido actualizado correctamente');
      setEditingOrder(null);
      await loadOrders(true);
    } catch (err) {
      toast('Error guardando cambios: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSendToSupplier = async (order, forcedPlatform = null) => {
    const platform = forcedPlatform || order.supplier_platform || 'Dropea';
    const isDropi = String(platform).toLowerCase().includes('dropi');
    const label = isDropi ? 'Dropi Chile (vía Dropi MCP Oficial)' : platform;
    if (!window.confirm(`¿Confirmas crear el pedido #${order.order_number} (${order.product_name}) directamente en ${label} para despacho contra entrega (CON RECAUDO)?`)) return;

    setSendingOrderId(order.id);
    try {
      const res = await api(`/landings/orders/${encodeURIComponent(order.id)}/send-supplier`, {
        method: 'POST',
        body: { platform }
      });
      toast(`🚀 ${res.message || 'Orden enviada a ' + label}`);
      await loadOrders(true);
    } catch (e) {
      toast('Error al enviar a proveedor: ' + e.message);
    } finally {
      setSendingOrderId(null);
    }
  };

  const handleSaveMapping = async (landing) => {
    setSavingMapping(true);
    try {
      await api(`/landings/mapping/${encodeURIComponent(landing.id)}`, {
        method: 'PUT',
        body: {
          name: landing.name,
          url: landing.url,
          master_sku: landing.master_sku,
          supplier_platform: landing.supplier_platform,
          supplier_product_id: landing.supplier_product_id,
          auto_fulfillment: landing.auto_fulfillment
        }
      });
      toast(`✅ Mapeo de ${landing.name} guardado correctamente`);
      await loadOrders(true);
    } catch (e) {
      toast('Error guardando mapeo: ' + e.message);
    } finally {
      setSavingMapping(false);
    }
  };

  const getWhatsAppLink = (order) => {
    const cleanPhone = (order.customer_phone || '').replace(/[^0-9]/g, '');
    const phoneWithCode = cleanPhone.startsWith('56') ? cleanPhone : `56${cleanPhone}`;
    const text = encodeURIComponent(
      `¡Hola ${order.customer_name}! 👋 Te contactamos de ${order.product_name} para confirmar tu pedido contra entrega de ${order.pack_selected} por un total de $${Number(order.total_price || 0).toLocaleString('es-CL')} a despachar a ${order.customer_commune || 'tu comuna'}, ${order.customer_address || ''}. ¿Nos confirmas para preparar el paquete hoy mismo? 📦🚚`
    );
    return `https://wa.me/${phoneWithCode}?text=${text}`;
  };

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const paidOrders = orders.filter(o => o.status === 'paid');
  const supplierOrders = orders.filter(o => ['sent_to_supplier', 'shipped', 'delivered'].includes(o.status));
  const totalAmount = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);

  return (
    <div className="nx-orders-container">
      <style>{`
        .nx-orders-container {
          padding: 0 0 20px 0;
          width: 100%;
          box-sizing: border-box;
        }
        .nx-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 12px;
        }
        @media(max-width: 900px) {
          .nx-kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .nx-kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          padding: 11px 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        [data-theme="night"] .nx-kpi-card {
          background: #16263e;
          border-color: #2b3d57;
        }
        .nx-kpi-title {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #64748b;
          display: block;
        }
        [data-theme="night"] .nx-kpi-title {
          color: #94a3b8 !important;
        }
        .nx-kpi-val {
          font-size: 1.55rem;
          font-weight: 800;
          margin-top: 2px;
          line-height: 1.1;
          color: #0f172a;
        }
        [data-theme="night"] .nx-kpi-val {
          color: #ffffff !important;
        }
        .nx-filter-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 8px 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          margin-bottom: 10px;
        }
        [data-theme="night"] .nx-filter-bar {
          background: #16263e;
          border-color: #2b3d57;
        }
        .nx-filter-input {
          height: 33px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0 8px;
          font-size: 12px;
          font-weight: 500;
          background: #ffffff;
          color: #0f172a;
          outline: none;
        }
        [data-theme="night"] .nx-filter-input {
          background: #102039;
          border-color: #354c6b;
          color: #e1e9f5;
        }
        .nx-table-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          overflow: hidden;
          width: 100%;
          box-shadow: 0 1px 4px rgba(0,0,0,0.02);
        }
        [data-theme="night"] .nx-table-card {
          background: #16263e;
          border-color: #2b3d57;
        }
        .nx-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 11.5px;
        }
        .nx-table thead tr {
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        [data-theme="night"] .nx-table thead tr {
          background: #102039;
          border-bottom: 1px solid #273b57;
        }
        .nx-table th {
          font-size: 10px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
          padding: 8px 4px;
        }
        [data-theme="night"] .nx-table th {
          color: #94a3b8;
        }
        .nx-table tbody tr {
          border-bottom: 1px solid #f1f5f9;
          background: #ffffff;
          transition: background 0.1s ease;
        }
        .nx-table tbody tr:hover {
          background: #f8fafc;
        }
        [data-theme="night"] .nx-table tbody tr {
          background: #16263e;
          border-bottom: 1px solid #203147;
        }
        [data-theme="night"] .nx-table tbody tr:hover {
          background: #1b304f;
        }
        .nx-table td {
          padding: 7px 4px;
          vertical-align: middle;
        }
        .nx-cust-name {
          font-weight: 800;
          font-size: 12px;
          color: #0f172a;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        [data-theme="night"] .nx-cust-name {
          color: #ffffff !important;
        }
        .nx-prod-title {
          font-weight: 700;
          font-size: 12px;
          color: #0f172a;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        [data-theme="night"] .nx-prod-title {
          color: #f1f5f9 !important;
        }
        .nx-sku-box {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: #f1f5f9;
          padding: 2px 5px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 10.5px;
          color: #0f172a;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        [data-theme="night"] .nx-sku-box {
          background: #102039;
          border: 1px solid #273b57;
          color: #93c5fd;
        }
        .nx-btn-send {
          background: #0066ff;
          color: #ffffff;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10.5px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
          transition: background 0.15s ease;
        }
        .nx-btn-send:hover {
          background: #0052cc;
        }
        .nx-btn-edit {
          background: transparent;
          color: var(--muted, #64748b);
          border: 1px solid var(--border, #cbd5e1);
          padding: 4px 7px;
          border-radius: 4px;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 2px;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        [data-theme="night"] .nx-btn-edit {
          border-color: #334a69;
          color: #94a3b8;
        }
        .nx-btn-edit:hover {
          background: rgba(0, 102, 255, 0.08);
          color: #0066ff;
          border-color: #0066ff;
        }
      `}</style>

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShoppingBag size={19} color="#0066ff" />
              Pedidos Landings (COD)
            </h1>
            <span style={{ 
              background: 'rgba(0, 102, 255, 0.1)', 
              color: '#0066ff', 
              fontSize: '0.7rem', 
              fontWeight: 800, 
              padding: '2px 7px', 
              borderRadius: '999px' 
            }}>
              CONTRA ENTREGA
            </span>
          </div>
          <p style={{ margin: '2px 0 0 0', color: 'var(--muted, #64748b)', fontSize: '0.8rem' }}>
            Centralización de pedidos recibidos desde landings en <b>pidedirecto.cyou</b> · Sincronización con Dropea y Dropi Chile
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button 
            className="outline" 
            onClick={() => loadOrders()} 
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', padding: '5px 10px' }}
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
            Actualizar
          </button>

          <button 
            className="primary" 
            onClick={() => setShowMappingModal(true)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              fontSize: '0.78rem', 
              padding: '5px 11px' 
            }}
          >
            <SlidersHorizontal size={13} />
            Mapeo SKU Maestro / Proveedor
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="nx-kpi-grid">
        <div className="nx-kpi-card">
          <span className="nx-kpi-title">TOTAL PEDIDOS</span>
          <div className="nx-kpi-val">
            {total}
          </div>
        </div>

        <div className="nx-kpi-card">
          <span className="nx-kpi-title" style={{ color: '#f59e0b' }}>🟡 PENDIENTES CONFIRMACIÓN</span>
          <div className="nx-kpi-val" style={{ color: '#f59e0b' }}>
            {pendingOrders.length}
          </div>
        </div>

        <div className="nx-kpi-card">
          <span className="nx-kpi-title" style={{ color: '#8b5cf6' }}>🟣 ENVIADOS A PROVEEDOR</span>
          <div className="nx-kpi-val" style={{ color: '#8b5cf6' }}>
            {supplierOrders.length}
          </div>
        </div>

        <div className="nx-kpi-card">
          <span className="nx-kpi-title" style={{ color: '#16a34a' }}>💰 TOTAL A RECAUDAR</span>
          <div className="nx-kpi-val" style={{ color: '#16a34a' }}>
            {money(totalAmount)}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="nx-filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '160px' }}>
          <Search size={14} color="var(--muted, #64748b)" />
          <input 
            type="text"
            className="nx-filter-input"
            placeholder="Buscar por cliente, teléfono, comuna, producto o SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Landing filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)', fontWeight: 700 }}>Landing:</span>
          <select 
            value={selectedLanding}
            onChange={e => setSelectedLanding(e.target.value)}
            className="nx-filter-input"
          >
            <option value="all">Todas las landings</option>
            {landings.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.id})</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)', fontWeight: 700 }}>Estado:</span>
          <select 
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="nx-filter-input"
          >
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([stKey, stVal]) => (
              <option key={stKey} value={stKey}>{stVal.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table con anchos perfectamente calibrados */}
      <div className="nx-table-card">
        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 14px', color: 'var(--muted, #64748b)' }}>
            <ShoppingBag size={36} style={{ margin: '0 auto 6px', opacity: 0.35 }} />
            <h3 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', color: 'var(--text, #0f172a)' }}>No hay pedidos contra entrega que coincidan</h3>
            <p style={{ margin: 0, fontSize: '0.78rem' }}>
              Cuando los clientes ordenen desde <b>pidedirecto.cyou</b>, aparecerán aquí en tiempo real para confirmación y despacho.
            </p>
          </div>
        ) : (
          <table className="nx-table">
            <colgroup>
              {/* 1. N° Pedido: 38px, solo número */}
              <col style={{ width: '38px' }} />
              {/* 2. Fecha / Hora: 90px (espacio suficiente para que no choque con Landing) */}
              <col style={{ width: '90px' }} />
              {/* 3. Landing: 22% proporcionado */}
              <col style={{ width: '22%' }} />
              {/* 4. SKU & Proveedor: 130px (para que el código SKU no se corte) */}
              <col style={{ width: '130px' }} />
              {/* 5. Variante: 70px */}
              <col style={{ width: '70px' }} />
              {/* 6. Cliente / Despacho: 180px (para nombre completo sin puntos suspensivos) */}
              <col style={{ width: '180px' }} />
              {/* 7. Total: 65px (alineado a la izquierda, pegadito al cliente) */}
              <col style={{ width: '65px' }} />
              {/* 8. Estado: 185px (botón completo con altura 28px, bordes definidos y margen) */}
              <col style={{ width: '185px' }} />
              {/* 9. Acción: 185px (espacio amplio para ambos botones) */}
              <col style={{ width: '185px' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ paddingLeft: '12px', textAlign: 'left' }}>N°</th>
                <th style={{ textAlign: 'left' }}>FECHA / HORA</th>
                <th style={{ textAlign: 'left' }}>LANDING / ORIGEN</th>
                <th style={{ textAlign: 'left' }}>SKU & PROVEEDOR</th>
                <th style={{ textAlign: 'center' }}>VARIANTE</th>
                <th style={{ textAlign: 'left' }}>CLIENTE / DESPACHO</th>
                <th style={{ textAlign: 'left', paddingLeft: '4px' }}>TOTAL</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'center', paddingRight: '12px' }}>ACCIÓN</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                const isSent = order.status === 'sent_to_supplier' || order.status === 'shipped' || order.status === 'delivered';
                const geo = getOrderGeo(order);

                return (
                  <tr key={order.id}>
                    {/* N° Pedido: clic para abrir pop-up detallado */}
                    <td
                      style={{ paddingLeft: '12px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      onClick={() => setViewingOrder(order)}
                      title="Ver ficha detallada del pedido y validación Google Maps"
                    >
                      <b style={{ color: '#0066ff', fontSize: '13px', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                        {order.order_number || '1'}
                      </b>
                    </td>

                    {/* Fecha / Hora */}
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--muted, #64748b)', fontSize: '0.76rem' }}>
                      <div style={{ fontWeight: 600 }}>{new Date(order.created_at).toLocaleDateString('es-CL')}</div>
                      <small style={{ fontSize: '0.68rem', opacity: 0.85 }}>{new Date(order.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</small>
                    </td>

                    {/* Landing Origen */}
                    <td style={{ textAlign: 'left' }}>
                      <div className="nx-prod-title">
                        {order.product_name || order.landing_id}
                      </div>
                      <a 
                        href={`https://${order.landing_id}.pidedirecto.cyou`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.7rem', color: '#0066ff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '1px', fontWeight: 600 }}
                      >
                        {order.landing_id}.pidedirecto.cyou
                        <ArrowUpRight size={9} />
                      </a>
                    </td>

                    {/* SKU Maestro & Proveedor */}
                    <td style={{ textAlign: 'left' }}>
                      <div className="nx-sku-box">
                        <Package size={10} style={{ opacity: 0.7 }} />
                        {order.master_sku || `SKU-${order.landing_id.toUpperCase()}-01`}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--muted, #64748b)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <b>{order.supplier_platform || 'Dropea'}</b> {order.supplier_product_id ? `(#${order.supplier_product_id})` : ''}
                      </div>
                    </td>

                    {/* Pack / Variante */}
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span style={{ 
                        background: 'rgba(0, 102, 255, 0.08)', 
                        color: '#0066ff', 
                        fontSize: '0.72rem', 
                        fontWeight: 700, 
                        padding: '2px 5px', 
                        borderRadius: '3px',
                        display: 'inline-block'
                      }}>
                        {order.pack_selected || '1 Unidad'}
                      </span>
                    </td>

                    {/* Cliente / Despacho: Compacto con validación Google Maps y clic para abrir pop-up */}
                    <td
                      style={{ textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => setViewingOrder(order)}
                      title="Clic para abrir ficha detallada y dirección exacta en Google Maps"
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {/* Línea 1: Nombre Cliente */}
                        <div className="nx-cust-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{order.customer_name}</span>
                        </div>

                        {/* Línea 2: Teléfono WhatsApp + Badge Google Maps */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
                          <a 
                            href={getWhatsAppLink(order)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '3px', 
                              background: '#16a34a', 
                              color: '#ffffff', 
                              padding: '1px 5px', 
                              borderRadius: '3px', 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              textDecoration: 'none' 
                            }}
                            title="Confirmar por WhatsApp"
                          >
                            <Phone size={9} />
                            {order.customer_phone}
                          </a>

                          {geo?.status === 'valid' ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              background: 'rgba(34, 197, 94, 0.15)',
                              color: '#22c55e',
                              border: '1px solid rgba(34, 197, 94, 0.35)',
                              padding: '0 5px',
                              borderRadius: '3px',
                              fontSize: '9.5px',
                              fontWeight: 800
                            }}>
                              ✓ Validada
                            </span>
                          ) : geo?.status === 'approx' || geo?.status === 'invalid' ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              background: 'rgba(245, 158, 11, 0.16)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              padding: '0 5px',
                              borderRadius: '3px',
                              fontSize: '9.5px',
                              fontWeight: 800
                            }}>
                              ⚠ Revisar
                            </span>
                          ) : null}
                        </div>

                        {/* Línea 3: Comuna + botón compacto Ver dirección */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: '#94a3b8', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <MapPin size={10} style={{ color: '#38bdf8', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: 'var(--text, #e2e8f0)' }}>{order.customer_commune || 'Comuna'}</span>
                          <span style={{ color: '#38bdf8', fontSize: '10px', fontWeight: 600 }}>· Ver mapa ↗</span>
                        </div>
                      </div>
                    </td>

                    {/* Total a Cobrar: pegadito a la izquierda al lado del cliente */}
                    <td style={{ textAlign: 'left', paddingLeft: '4px', fontWeight: 800, fontSize: '0.88rem', color: '#16a34a', whiteSpace: 'nowrap' }}>
                      {money(order.total_price)}
                    </td>

                    {/* Estado: Botón de estado completo con bordes limpios, altura 28px y espacio propio */}
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '6px 4px' }}>
                      <select 
                        value={order.status}
                        onChange={e => handleUpdateStatus(order.id, e.target.value)}
                        disabled={updatingStatusId === order.id}
                        style={{ 
                          background: document.documentElement.dataset.theme === 'night' ? st.nightBg : st.bg, 
                          color: document.documentElement.dataset.theme === 'night' ? st.nightColor : st.color, 
                          border: `1.5px solid ${st.color}`, 
                          fontWeight: 700, 
                          fontSize: '0.72rem', 
                          borderRadius: '6px', 
                          padding: '0 8px',
                          height: '28px',
                          cursor: 'pointer',
                          outline: 'none',
                          width: '100%',
                          maxWidth: '175px',
                          boxSizing: 'border-box'
                        }}
                      >
                        {Object.entries(STATUS_CONFIG).map(([stKey, stVal]) => (
                          <option key={stKey} value={stKey}>{stVal.label}</option>
                        ))}
                      </select>
                      {order.guide_number && (
                        <div style={{ fontSize: '0.68rem', marginTop: '2px', color: '#0066ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Guía: <b>{order.guide_number}</b>
                        </div>
                      )}
                    </td>

                    {/* Acción: Botón Despacho + Botón Modificar Pedido */}
                    <td style={{ textAlign: 'center', paddingRight: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {isSent ? (
                          <span style={{ color: '#16a34a', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle2 size={12} />
                            Despachado
                          </span>
                        ) : (
                          <button 
                            className="nx-btn-send"
                            onClick={() => handleSendToSupplier(order)}
                            disabled={sendingOrderId === order.id}
                            style={{ 
                              background: order.supplier_platform === 'Dropi' ? '#ea580c' : '#0066ff',
                              height: '28px',
                              padding: '0 9px'
                            }}
                          >
                            <Send size={11} />
                            {sendingOrderId === order.id ? '…' : (order.supplier_platform === 'Dropi' ? 'Enviar a Dropi MCP' : `Enviar a ${order.supplier_platform || 'Dropea'}`)}
                          </button>
                        )}

                        <button 
                          className="nx-btn-edit"
                          onClick={() => setEditingOrder({ ...order })}
                          title="Modificar datos del pedido (cliente, dirección, pack, total)"
                          style={{
                            height: '28px',
                            padding: '0 8px'
                          }}
                        >
                          <Pencil size={11} />
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      
      {/* Modal: FICHA DETALLADA DEL PEDIDO Y VALIDACIÓN GOOGLE MAPS */}
      {viewingOrder && (() => {
        const geo = getOrderGeo(viewingOrder);
        const st = STATUS_CONFIG[viewingOrder.status] || STATUS_CONFIG.pending;
        const exactAddr = geo?.formatted || `${viewingOrder.customer_address || ''}, ${viewingOrder.customer_commune || ''}, Chile`;
        const mapQuery = geo?.lat && geo?.lng
          ? `${geo.lat},${geo.lng}`
          : encodeURIComponent(`${viewingOrder.customer_address || ''}, ${viewingOrder.customer_commune || ''}, Chile`);
        const cleanPhone = (viewingOrder.customer_phone || '').replace(/[^0-9]/g, '');
        const phoneWithCode = cleanPhone.startsWith('56') ? cleanPhone : `56${cleanPhone}`;
        const waConfirmedMsg = encodeURIComponent(
          `¡Hola ${viewingOrder.customer_name}! 👋 Te escribimos de *${viewingOrder.product_name}* para informarte que tu pedido #${viewingOrder.order_number || '1'} (${viewingOrder.pack_selected || '1 Unidad'} · Total contra entrega: *${money(viewingOrder.total_price)}*) ya está confirmado.

📍 Tu dirección de despacho en *${exactAddr}* fue **validada correctamente** ✅ en nuestro sistema. ¡Pronto te enviaremos tu código de seguimiento! 📦🚚`
        );
        const waAskAddressMsg = encodeURIComponent(
          `¡Hola ${viewingOrder.customer_name}! 👋 Te escribimos por tu pedido #${viewingOrder.order_number || '1'} de *${viewingOrder.product_name}*. Para despachar tu paquete sin demoras en *${viewingOrder.customer_commune || 'tu comuna'}*, ¿nos podrías confirmar el nombre exacto de tu calle, numeración o alguna referencia de tu domicilio (actualmente tenemos registrado: "${viewingOrder.customer_address || ''}")? ¡Muchas gracias! 📍🚚`
        );

        return (
          <div
            className="modalBackdrop"
            onClick={() => setViewingOrder(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5, 12, 24, 0.72)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '16px'
            }}
          >
            <div
              className="nx-kpi-card"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '640px',
                width: '100%',
                borderRadius: '14px',
                padding: '18px 20px',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
                border: '1px solid #2b3d57'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', marginBottom: '14px', borderBottom: '1px solid rgba(148, 163, 184, 0.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: '#0066ff', color: '#fff', fontWeight: 800, fontSize: '0.9rem', padding: '4px 10px', borderRadius: '7px' }}>
                    Pedido #{viewingOrder.order_number || '1'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>{viewingOrder.customer_name}</div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                      {new Date(viewingOrder.created_at).toLocaleString('es-CL')} · Landing: <b>{viewingOrder.landing_id}</b>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setViewingOrder(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                >
                  <X size={19} />
                </button>
              </div>

              {/* Cuadradito 1: Resumen del Pedido y Cliente */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                marginBottom: '14px'
              }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.35)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '9px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3px' }}>
                    CLIENTE Y CONTACTO
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{viewingOrder.customer_name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700, marginTop: '2px' }}>
                    {viewingOrder.customer_phone}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                    {viewingOrder.customer_commune} · {viewingOrder.customer_region || 'Chile'}
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.35)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '9px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3px' }}>
                    PRODUCTO Y DESPACHO
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>{viewingOrder.product_name}</div>
                  <div style={{ fontSize: '0.76rem', color: '#60a5fa', fontWeight: 700, marginTop: '2px' }}>
                    {viewingOrder.pack_selected || '1 Unidad'} · SKU: {viewingOrder.master_sku || 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#22c55e', marginTop: '3px' }}>
                    Total COD: {money(viewingOrder.total_price)}
                  </div>
                </div>
              </div>

              {/* Cuadradito 2: Validación Google Maps */}
              <div style={{
                background: geo?.status === 'valid' ? 'rgba(22, 163, 74, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                border: `1.5px solid ${geo?.status === 'valid' ? '#22c55e' : '#f59e0b'}`,
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={18} color={geo?.status === 'valid' ? '#22c55e' : '#f59e0b'} />
                    <span style={{ fontWeight: 800, fontSize: '0.84rem', color: geo?.status === 'valid' ? '#22c55e' : '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {geo?.status === 'valid'
                        ? '✅ Dirección Validada por Google Maps'
                        : '⚠️ Dirección Aproximada · Verificar Numeración'}
                    </span>
                  </div>
                  {geo?.postalCode && (
                    <span style={{ fontSize: '0.72rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                      Cód. Postal: {geo.postalCode}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 600 }}>Escrita por el cliente: </span>
                    <b style={{ color: 'var(--text, #f1f5f9)' }}>
                      {viewingOrder.customer_address || 'Sin dirección'} ({viewingOrder.customer_commune})
                    </b>
                  </div>

                  {geo?.formatted && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 600 }}>Dirección Exacta Google Maps: </span>
                        <b style={{ color: '#22c55e' }}>{geo.formatted}</b>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mapa Google Maps interactivo */}
                <div style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.25)', height: '195px', background: '#0f172a' }}>
                  <iframe
                    title="Ubicación Google Maps"
                    width="100%"
                    height="195"
                    style={{ border: 0, display: 'block' }}
                    loading="lazy"
                    allowFullScreen
                    src={`https://maps.google.com/maps?q=${mapQuery}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                  />
                </div>
              </div>

              {/* Cuadradito 3: Acciones Rápidas WhatsApp y Despacho */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <a
                    href={`https://wa.me/${phoneWithCode}?text=${waConfirmedMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: '#16a34a',
                      color: '#ffffff',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      textDecoration: 'none',
                      textAlign: 'center'
                    }}
                  >
                    <Phone size={14} />
                    WhatsApp: Confirmar Pedido + Dirección OK
                  </a>

                  <a
                    href={`https://wa.me/${phoneWithCode}?text=${waAskAddressMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: 'rgba(245, 158, 11, 0.16)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      textDecoration: 'none',
                      textAlign: 'center'
                    }}
                  >
                    <MapPin size={14} />
                    WhatsApp: Pedir Referencia / N° Casa
                  </a>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(148, 163, 184, 0.18)', gap: '8px' }}>
                  <button
                    type="button"
                    className="nx-btn-edit"
                    onClick={() => {
                      const ord = viewingOrder;
                      setViewingOrder(null);
                      setEditingOrder({ ...ord });
                    }}
                    style={{ height: '32px', padding: '0 12px' }}
                  >
                    <Pencil size={12} />
                    Editar Datos del Pedido
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="nx-btn-send"
                      onClick={() => {
                        const ord = viewingOrder;
                        setViewingOrder(null);
                        handleSendToSupplier(ord);
                      }}
                      style={{ height: '32px', padding: '0 14px', background: '#0066ff' }}
                    >
                      <Send size={12} />
                      {viewingOrder.supplier_platform === 'Dropi' ? 'Crear Pedido en Dropi MCP' : `Enviar a ${viewingOrder.supplier_platform || 'Dropea'}`}
                    </button>

                    <button
                      type="button"
                      className="outline"
                      onClick={() => setViewingOrder(null)}
                      style={{ height: '32px', padding: '0 14px', fontSize: '0.78rem' }}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: MODIFICAR PEDIDO COD */}
      {editingOrder && (
        <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div className="nx-kpi-card" style={{ maxWidth: '600px', width: '100%', borderRadius: '12px', padding: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Pencil size={17} color="#0066ff" />
                  Modificar Pedido {editingOrder.order_number || '1'}
                </h3>
                <small style={{ color: 'var(--muted, #64748b)' }}>
                  Corrige los datos del cliente, dirección o producto antes de despachar a bodega.
                </small>
              </div>
              <button onClick={() => setEditingOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted, #64748b)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveOrderEdit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Nombre del Cliente
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.customer_name || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Teléfono (WhatsApp)
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.customer_phone || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, customer_phone: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Dirección (Calle, Número, Depto)
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.customer_address || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, customer_address: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Comuna
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.customer_commune || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, customer_commune: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Pack / Variante
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.pack_selected || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, pack_selected: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Total a Cobrar ($ CLP)
                  </label>
                  <input 
                    type="number" 
                    value={editingOrder.total_price || 0} 
                    onChange={e => setEditingOrder({ ...editingOrder, total_price: Number(e.target.value) })}
                    className="nx-filter-input"
                    style={{ width: '100%', fontWeight: 700, color: '#16a34a' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    SKU Maestro
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.master_sku || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, master_sku: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Proveedor
                  </label>
                  <select 
                    value={editingOrder.supplier_platform || 'Dropea'} 
                    onChange={e => setEditingOrder({ ...editingOrder, supplier_platform: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                  >
                    <option value="Dropea">Dropea COD</option>
                    <option value="Dropi">Dropi Chile</option>
                    <option value="Propio">Bodega Propia</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    ID Proveedor
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.supplier_product_id || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, supplier_product_id: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    Estado del Pedido
                  </label>
                  <select 
                    value={editingOrder.status || 'pending'} 
                    onChange={e => setEditingOrder({ ...editingOrder, status: e.target.value })}
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                  >
                    {Object.entries(STATUS_CONFIG).map(([stKey, stVal]) => (
                      <option key={stKey} value={stKey}>{stVal.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '3px' }}>
                    N° de Guía (Opcional)
                  </label>
                  <input 
                    type="text" 
                    value={editingOrder.guide_number || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, guide_number: e.target.value })}
                    placeholder="ej: BLX-1928381"
                    className="nx-filter-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border, #e2e8f0)' }}>
                <button type="button" className="outline" onClick={() => setEditingOrder(null)}>
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={savingEdit} style={{ padding: '6px 16px', fontWeight: 700 }}>
                  {savingEdit ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Mapeo de SKU Maestro por Landing */}
      {showMappingModal && (
        <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div className="nx-kpi-card" style={{ maxWidth: '800px', width: '100%', borderRadius: '12px', padding: '18px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SlidersHorizontal size={17} color="#0066ff" />
                  Mapeo de SKU Maestro por Landing
                </h3>
                <small style={{ color: 'var(--muted, #64748b)' }}>
                  Asocia a cada landing de marketing el código interno de bodega y proveedor para que al recibir el pedido se despache el producto exacto.
                </small>
              </div>
              <button onClick={() => setShowMappingModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted, #64748b)' }}>
                <X size={17} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {mappings.map(landing => (
                  <div 
                    key={landing.id} 
                    style={{ 
                      padding: '12px', 
                      borderRadius: '8px', 
                      border: '1px solid var(--border, #e2e8f0)', 
                      background: 'rgba(0, 102, 255, 0.02)',
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                      gap: '8px',
                      alignItems: 'end'
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '2px' }}>
                        Landing (Nombre)
                      </label>
                      <input 
                        type="text" 
                        value={landing.name} 
                        className="nx-filter-input"
                        onChange={e => {
                          const val = e.target.value;
                          setMappings(mappings.map(m => m.id === landing.id ? { ...m, name: val } : m));
                        }}
                        style={{ width: '100%', fontWeight: 700 }}
                      />
                      <small style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>ID: {landing.id}</small>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '2px' }}>
                        SKU Maestro (Bodega)
                      </label>
                      <input 
                        type="text" 
                        value={landing.master_sku || ''} 
                        placeholder="ej: AERO-MAG-01"
                        className="nx-filter-input"
                        onChange={e => {
                          const val = e.target.value;
                          setMappings(mappings.map(m => m.id === landing.id ? { ...m, master_sku: val } : m));
                        }}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '2px' }}>
                        Plataforma Proveedor
                      </label>
                      <select 
                        value={landing.supplier_platform || 'Dropea'}
                        onChange={e => {
                          const val = e.target.value;
                          setMappings(mappings.map(m => m.id === landing.id ? { ...m, supplier_platform: val } : m));
                        }}
                        className="nx-filter-input"
                        style={{ width: '100%' }}
                      >
                        <option value="Dropea">Dropea COD</option>
                        <option value="Dropi">Dropi Chile</option>
                        <option value="Propio">Bodega Propia (Local)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted, #64748b)', marginBottom: '2px' }}>
                        ID en Proveedor (ej: 10482)
                      </label>
                      <input 
                        type="text" 
                        value={landing.supplier_product_id || ''} 
                        placeholder="10482"
                        className="nx-filter-input"
                        onChange={e => {
                          const val = e.target.value;
                          setMappings(mappings.map(m => m.id === landing.id ? { ...m, supplier_product_id: val } : m));
                        }}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <button 
                        className="primary"
                        onClick={() => handleSaveMapping(landing)}
                        disabled={savingMapping}
                        style={{ width: '100%', height: '33px', fontSize: '0.78rem', fontWeight: 700 }}
                      >
                        Guardar Mapeo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid var(--border, #e2e8f0)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="outline" onClick={() => setShowMappingModal(false)}>
                Listo / Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
