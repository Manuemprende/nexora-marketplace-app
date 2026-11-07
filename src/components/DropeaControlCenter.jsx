import React, { useState, useEffect } from 'react';
import { api, money } from '../services/api';
import { 
  Package, ShoppingBag, RefreshCw, Send, CheckCircle2, 
  AlertTriangle, Truck, Clock, ShieldCheck, Plus, X, 
  ExternalLink, Layers, Search, Settings as SettingsIcon, AlertCircle
} from 'lucide-react';
import { Heading } from './Common';

export default function DropeaControlCenter({ products = [], toast = () => {} }) {
  const [tab, setTab] = useState('orders'); // 'orders' | 'products' | 'webhooks' | 'settings'
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [dropeaProducts, setDropeaProducts] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);

  // New Order Form State (Cash On Delivery)
  const [orderForm, setOrderForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    shipping_address: '',
    shipping_city: 'Santiago',
    shipping_notes: '',
    product_variant_id: products[0]?.id || '',
    quantity: 1,
    cod_amount: products[0]?.price || 14990
  });

  const loadStatus = async () => {
    try {
      const res = await api('/integrations/dropea/status');
      setStatus(res);
    } catch {}
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api('/integrations/dropea/orders');
      setOrders(res.orders || []);
      if (res.webhooks) setWebhooks(res.webhooks);
    } catch (e) {
      toast('Error al consultar órdenes: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDropeaProducts = async () => {
    setLoading(true);
    try {
      const res = await api('/integrations/dropea/products');
      setDropeaProducts(res.products || []);
    } catch (e) {
      toast('Error al consultar catálogo: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadWebhooks = async () => {
    try {
      const res = await api('/integrations/dropea/webhooks');
      setWebhooks(res.webhooks || []);
    } catch {}
  };

  useEffect(() => {
    loadStatus();
    loadOrders();
  }, []);

  const handleRegisterWebhook = async () => {
    setRegisteringWebhook(true);
    try {
      const res = await api('/integrations/dropea/webhooks/register', { method: 'POST' });
      toast('✓ Webhook registrado exitosamente en Dropea');
      loadStatus();
    } catch (e) {
      toast('Aviso: ' + (e.message || 'Verifica la API key en Dropea'));
    } finally {
      setRegisteringWebhook(false);
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.customer_name || !orderForm.customer_phone || !orderForm.shipping_address) {
      toast('Completa nombre, teléfono y dirección');
      return;
    }

    const selectedProduct = products.find(p => p.id === orderForm.product_variant_id) || products[0];

    const payload = {
      customer_details: {
        name: orderForm.customer_name,
        email: orderForm.customer_email || 'cliente@nexora.io',
        phone: orderForm.customer_phone,
        shipping_address: {
          address: orderForm.shipping_address,
          city: orderForm.shipping_city,
          country: status?.market || 'CL',
          notes: orderForm.shipping_notes
        }
      },
      line_items: [
        {
          sku: selectedProduct?.sku || 'NEX-00001',
          name: selectedProduct?.name || 'Producto Nexora',
          quantity: Number(orderForm.quantity),
          unit_price: Number(orderForm.cod_amount)
        }
      ],
      payment_method: 'cod', // Cash on delivery (Pago contra entrega)
      total_amount: Number(orderForm.cod_amount) * Number(orderForm.quantity)
    };

    setLoading(true);
    try {
      const res = await api('/integrations/dropea/orders', {
        method: 'POST',
        body: payload
      });
      toast('✓ Pedido Dropea creado exitosamente');
      setModalOpen(false);
      setOrderForm({
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        shipping_address: '',
        shipping_city: 'Santiago',
        shipping_notes: '',
        product_variant_id: products[0]?.id || '',
        quantity: 1,
        cod_amount: products[0]?.price || 14990
      });
      loadOrders();
    } catch (e) {
      toast('Error al crear orden: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOrder = async (id) => {
    if (!confirm(`¿Confirmar orden ${id} en Dropea?`)) return;
    try {
      await api(`/integrations/dropea/orders/${id}/confirm`, { method: 'POST' });
      toast('✓ Orden confirmada en Dropea');
      loadOrders();
    } catch (e) {
      toast('Error al confirmar: ' + e.message);
    }
  };

  const handleCancelOrder = async (id) => {
    const reason = prompt('Motivo de cancelación:', 'Cancelado por el comprador');
    if (!reason) return;
    try {
      await api(`/integrations/dropea/orders/${id}/cancel`, {
        method: 'POST',
        body: { reason }
      });
      toast('✓ Orden cancelada en Dropea');
      loadOrders();
    } catch (e) {
      toast('Error al cancelar: ' + e.message);
    }
  };

  return (
    <div className="dropeaHub">
      <Heading 
        eyebrow="ECOSISTEMA DROPSHIPPING & PAGO CONTRA ENTREGA" 
        title="Centro de Control Dropea" 
        subtitle="Administra pedidos, catálogo de reventa, envíos contra reembolso y webhooks directos con Dropea."
      />

      {/* Barra de Estado Rápido */}
      <div className="panel" style={{ marginBottom: '18px', background: '#0b1626', color: '#fff', border: '1px solid #1e3a5f' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>
              DP
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <b style={{ fontSize: '16px', color: '#00F0FF' }}>Dropea Dropshipper API</b>
                <span className={'tag ' + (status?.configured ? 'success' : 'warning')} style={{ fontSize: '10px' }}>
                  {status?.configured ? `Conectado · Mercado ${status.market}` : 'Sin Configurar'}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Host: <code>{status?.baseUrl || 'https://cl.public-api.dropea.com'}</code> · Token: <code>{status?.tokenMasked || '••••••••'}</code> · Firma HMAC: {status?.hasHmac ? '✓ Activa' : 'Inactiva'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="primary" 
              style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setModalOpen(true)}
            >
              <Plus size={15}/> Nuevo Pedido (COD)
            </button>
            <button 
              className="secondary" 
              style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', color: '#fff', border: '1px solid #334155' }}
              onClick={handleRegisterWebhook}
              disabled={registeringWebhook}
              title="Registra automáticamente https://nexora.wentixai.cyou/api/integrations/dropea/webhook en Dropea"
            >
              <ShieldCheck size={15} color="#10b981"/> 
              {registeringWebhook ? 'Registrando...' : 'Vincular Webhook'}
            </button>
            <button 
              className="secondary" 
              style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', color: '#fff', border: '1px solid #334155' }}
              onClick={() => { loadStatus(); loadOrders(); }}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''}/> Refrescar
            </button>
          </div>
        </div>
      </div>

      {/* Pestañas de Navegación del Centro de Control */}
      <div className="miniTabs" style={{ marginBottom: '16px' }}>
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => { setTab('orders'); loadOrders(); }}>
          <Truck size={14} style={{ display: 'inline', marginRight: '6px' }}/> Pedidos Dropea ({orders.length})
        </button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => { setTab('products'); loadDropeaProducts(); }}>
          <ShoppingBag size={14} style={{ display: 'inline', marginRight: '6px' }}/> Catálogo Reventa ({dropeaProducts.length})
        </button>
        <button className={tab === 'webhooks' ? 'active' : ''} onClick={() => { setTab('webhooks'); loadWebhooks(); }}>
          <Layers size={14} style={{ display: 'inline', marginRight: '6px' }}/> Eventos Webhooks ({webhooks.length})
        </button>
      </div>

      {/* TAB 1: PEDIDOS */}
      {tab === 'orders' && (
        <div className="panel">
          <div className="panelTitle">
            <div>
              <h3>Bandeja de Pedidos Dropea & Contra Reembolso</h3>
              <p className="muted" style={{ fontSize: '12px', margin: '4px 0 0' }}>
                Órdenes enviadas a Dropea para preparación y cobranza contra entrega en destino.
              </p>
            </div>
            <button className="primary outline" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={() => setModalOpen(true)}>
              + Crear Pedido
            </button>
          </div>

          {loading && orders.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
              Cargando órdenes desde Dropea...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <Truck size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }}/>
              <b>No hay pedidos registrados aún en Dropea</b>
              <p className="muted" style={{ fontSize: '12px', maxWidth: '400px', margin: '6px auto 14px' }}>
                Puedes generar un nuevo despacho contra entrega haciendo clic en "Nuevo Pedido (COD)".
              </p>
              <button className="primary" onClick={() => setModalOpen(true)}>Crear Primer Pedido</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '12px', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '10px 8px' }}>ID Dropea</th>
                    <th style={{ padding: '10px 8px' }}>Cliente</th>
                    <th style={{ padding: '10px 8px' }}>Dirección / Ciudad</th>
                    <th style={{ padding: '10px 8px' }}>Productos</th>
                    <th style={{ padding: '10px 8px' }}>Monto COD</th>
                    <th style={{ padding: '10px 8px' }}>Estado</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, idx) => {
                    const id = o.id || o.order_id || `DP-${idx + 100}`;
                    const customer = o.customer_details || o.customer || {};
                    const addr = customer.shipping_address || {};
                    const items = o.line_items || o.items || [];
                    const statusName = o.status || 'pending';
                    const isDelivered = statusName === 'delivered';
                    const isCancelled = statusName === 'cancelled';

                    return (
                      <tr key={id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: 700 }}>
                          {id}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <b>{customer.name || 'Cliente Dropea'}</b>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{customer.phone || 'Sin teléfono'}</div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {addr.address || 'Dirección registrada'}
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{addr.city || 'Chile'}</div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {items.length ? items.map((it, i) => (
                            <span key={i} className="tag neutral" style={{ marginRight: '4px', fontSize: '10px' }}>
                              {it.quantity}x {it.name || it.sku}
                            </span>
                          )) : <span className="muted">1 producto</span>}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>
                          {money(o.total_amount || o.cod_amount || 14990)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className={'tag ' + (isDelivered ? 'success' : isCancelled ? 'danger' : 'warning')}>
                            {statusName}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {statusName === 'pending' && (
                              <button 
                                className="secondary" 
                                style={{ fontSize: '10px', padding: '3px 8px' }}
                                onClick={() => handleConfirmOrder(id)}
                              >
                                Confirmar
                              </button>
                            )}
                            {!isCancelled && !isDelivered && (
                              <button 
                                className="outline" 
                                style={{ fontSize: '10px', padding: '3px 8px', color: '#ef4444', borderColor: '#fca5a5' }}
                                onClick={() => handleCancelOrder(id)}
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CATÁLOGO PRODUCTOS */}
      {tab === 'products' && (
        <div className="panel">
          <div className="panelTitle">
            <div>
              <h3>Catálogo de Productos para Revender en Dropea</h3>
              <p className="muted" style={{ fontSize: '12px', margin: '4px 0 0' }}>
                Productos listados en la red Dropea listos para comercializar en Mercado Libre, Shopify o redes sociales.
              </p>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
              Cargando catálogo Dropea...
            </div>
          ) : dropeaProducts.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <p className="muted">No hay productos remotos devueltos o la API está en modo de espera.</p>
              <button className="secondary" onClick={loadDropeaProducts}>Consultar nuevamente</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
              {dropeaProducts.map((p, i) => (
                <div key={p.id || i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
                  <b>{p.name || p.title}</b>
                  <span className="muted" style={{ fontSize: '11px', margin: '4px 0' }}>SKU Dropea: {p.sku || p.id}</span>
                  <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#10b981' }}>{money(p.price || p.cost_price || 0)}</span>
                    <button className="primary outline" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => toast('Producto vinculado al catálogo de Nexora')}>
                      Vincular a Nexora
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WEBHOOKS LIVE */}
      {tab === 'webhooks' && (
        <div className="panel">
          <div className="panelTitle">
            <div>
              <h3>Registro de Webhooks en Vivo (Dropea Feed)</h3>
              <p className="muted" style={{ fontSize: '12px', margin: '4px 0 0' }}>
                Notificaciones automáticas recibidas con firma criptográfica HMAC verificada.
              </p>
            </div>
            <button className="secondary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={loadWebhooks}>
              Actualizar Feed
            </button>
          </div>

          {webhooks.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
              <Layers size={32} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
              <p>Aún no se han recibido webhooks entrantes desde Dropea.</p>
              <p className="muted" style={{ fontSize: '11px' }}>
                Al despachar o cambiar el estado de un pedido en Dropea, el evento aparecerá aquí al instante.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '12px', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '8px' }}>Event ID</th>
                    <th style={{ padding: '8px' }}>Tema (Topic)</th>
                    <th style={{ padding: '8px' }}>Mercado</th>
                    <th style={{ padding: '8px' }}>Recurso</th>
                    <th style={{ padding: '8px' }}>Fecha</th>
                    <th style={{ padding: '8px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map(w => (
                    <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>{w.event_id?.slice(0, 16)}...</td>
                      <td style={{ padding: '8px' }}><b>{w.topic}</b></td>
                      <td style={{ padding: '8px' }}>{w.market}</td>
                      <td style={{ padding: '8px' }}>{w.resource_id || '-'}</td>
                      <td style={{ padding: '8px' }}>{new Date(w.received_at).toLocaleString('es-CL')}</td>
                      <td style={{ padding: '8px' }}>
                        <span className="tag success">✓ Procesado</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL NUEVO PEDIDO COD */}
      {modalOpen && (
        <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px' }}>Crear Pedido Dropea (Contra Entrega COD)</h3>
              <button className="iconBtn" onClick={() => setModalOpen(false)}><X size={18}/></button>
            </div>

            <form onSubmit={handleCreateOrder}>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Producto del Catálogo Nexora</label>
                  <select 
                    value={orderForm.product_variant_id} 
                    onChange={e => {
                      const p = products.find(x => x.id === e.target.value);
                      setOrderForm({
                        ...orderForm,
                        product_variant_id: e.target.value,
                        cod_amount: p?.price || orderForm.cod_amount
                      });
                    }}
                    style={{ width: '100%', padding: '7px' }}
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) - {money(p.price)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Cantidad de Unidades</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={orderForm.quantity} 
                      onChange={e => setOrderForm({ ...orderForm, quantity: e.target.value })}
                      style={{ width: '100%', padding: '7px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Monto a Cobrar (COD $ CLP)</label>
                    <input 
                      type="number" 
                      value={orderForm.cod_amount} 
                      onChange={e => setOrderForm({ ...orderForm, cod_amount: e.target.value })}
                      style={{ width: '100%', padding: '7px' }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #edf0f3', paddingTop: '10px', marginTop: '6px' }}>
                  <b style={{ fontSize: '12px', color: '#1e3a5f' }}>Datos del Comprador</b>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Nombre Completo</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Juan Pérez"
                    value={orderForm.customer_name} 
                    onChange={e => setOrderForm({ ...orderForm, customer_name: e.target.value })}
                    style={{ width: '100%', padding: '7px' }}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Teléfono Celular</label>
                    <input 
                      type="tel" 
                      placeholder="+56 9 1234 5678"
                      value={orderForm.customer_phone} 
                      onChange={e => setOrderForm({ ...orderForm, customer_phone: e.target.value })}
                      style={{ width: '100%', padding: '7px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Ciudad / Comuna</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Santiago / Las Condes"
                      value={orderForm.shipping_city} 
                      onChange={e => setOrderForm({ ...orderForm, shipping_city: e.target.value })}
                      style={{ width: '100%', padding: '7px' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Dirección de Entrega</label>
                  <input 
                    type="text" 
                    placeholder="Calle, número, departamento o referencia"
                    value={orderForm.shipping_address} 
                    onChange={e => setOrderForm({ ...orderForm, shipping_address: e.target.value })}
                    style={{ width: '100%', padding: '7px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>Instrucciones para el Transportista</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Tocar timbre 402, llamar antes de llegar"
                    value={orderForm.shipping_notes} 
                    onChange={e => setOrderForm({ ...orderForm, shipping_notes: e.target.value })}
                    style={{ width: '100%', padding: '7px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="primary" disabled={loading}>
                  {loading ? 'Enviando...' : 'Despachar con Dropea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
