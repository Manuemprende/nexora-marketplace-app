import React, { useEffect, useState } from 'react';
import { Bot, Users, ScanBarcode, CheckCircle2, Sparkles, Database, ShieldCheck, KeyRound, Cable } from 'lucide-react';
import PlatformLogo from '../components/PlatformLogo';
import { readApiView, api } from '../services/api';
import DropiWebConnection from '../components/DropiWebConnection';
import WhatsAppConnection from '../components/WhatsAppConnection';
import JumpsellerPreparationConnection from '../components/JumpsellerPreparationConnection';
import DropiConnection from '../components/DropiConnection';
import { usePolling } from '../services/usePolling';
import FactoConnection from '../components/FactoConnection';
import { BusinessSettings } from './Operations';
import PlatformSales from '../components/PlatformSales';
import { Heading } from '../components/Common';

export function Integrations({ sales = [], products = [], toast }) {
  const [connections, setConnections] = useState(() => readApiView('/order-sync/connections'));
  const [orders, setOrders] = useState(() => readApiView('/orders') ?? []);
  const [meli, setMeli] = useState(null);

  useEffect(() => {
    let mounted = true;
    api('/order-sync/connections').then(data => { if (mounted) setConnections(data); }).catch(() => {});
    api('/integrations/mercadolibre').then(data => { if (mounted) setMeli(data); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  usePolling(
    () => api('/orders').then(rows => setOrders(previous => JSON.stringify(previous) === JSON.stringify(rows) ? previous : rows)),
    30000
  );

  const hasCatalog = name =>
    products.some(p => p.active && (p.external_codes?.some(c => c.platform === name) || (name === 'Jumpseller' && p.source_url?.includes('meibo.cl'))));

  return (
    <>
      <Heading
        eyebrow="CONECTIVIDAD"
        title="Integraciones y Marketplaces"
        subtitle="Catálogos incorporados, estado de conexión por plataforma y ventas sincronizadas."
      />
      <div className="integrationCards">
        <DropiConnection toast={toast} />
        <DropiWebConnection toast={toast} />
        {['Evolut', 'Dropea', 'Jumpseller', 'Walmart'].map(name => {
          const available = hasCatalog(name);
          const connected = connections?.[name]?.connected || connections?.[name.toLowerCase()]?.state?.startsWith('connected');
          const badge = available
            ? 'Catálogo disponible'
            : name === 'Walmart'
              ? connected
                ? 'Conectada'
                : connected === false
                  ? 'Revisar conexión'
                  : 'Estado por comprobar'
              : connected
                ? 'Conectada'
                : 'Pendiente de conectar';
          const info = {
            Dropi: 'Recepción de pedidos y sincronización de catálogo y guías web.',
            Dropea: 'Catálogo incorporado y panel COD activo en menú lateral.',
            Evolut: 'Pedidos, etiquetas y confirmación de preparación desde Empaque.',
            Jumpseller: 'Catálogo sincronizado y recepción automática de pedidos pagados hacia Empaque.',
            Walmart: available
              ? 'Publicaciones vinculadas al SKU maestro.'
              : connected
                ? 'Conexión disponible. Publicación de productos lista para validar.'
                : 'La conexión y las publicaciones se revisan por separado del catálogo.',
          }[name];
          return (
            <div className="panel" key={name}>
              <PlatformLogo name={name} />
              <h3>{name}</h3>
              <p className="muted">Identificadores, precios y stock por canal vinculados al SKU maestro.</p>
              <span className={'tag ' + (available || connected ? 'success' : connected === false ? 'warning' : 'neutral')}>
                {badge}
              </span>
              <p className="fine">{info}</p>
            </div>
          );
        })}
        <div className="panel">
          <div className="channelBadge amber"><Cable size={20} /></div>
          <h3>Mercado Libre</h3>
          <p className="muted">Sincronización OAuth y notificaciones webhook en tiempo real.</p>
          <span className={'tag ' + (meli?.connected ? 'success' : 'neutral')}>
            {meli?.connected ? `Conectada · ${meli.nickname || meli.seller_id || 'Activa'}` : 'OAuth disponible'}
          </span>
          <p className="fine">Vinculación de publicaciones con SKU maestro y alertas de venta.</p>
        </div>
        <FactoConnection />
      </div>
      <PlatformSales orders={orders} sales={sales} products={products} />
    </>
  );
}

export function Mcp({ readOnly, toast }) {
  return (
    <>
      <Heading
        eyebrow="CONEXIÓN OFICIAL MCP"
        title="Centro MCP / IA & Dropi MCP"
        subtitle="Creación directa de pedidos en Dropi Chile (create_order), cotización logística (quote_shipping) y herramientas de inventario Nexora."
      />
      <div className="settingsConnectionGroup" style={{ marginBottom: 18 }}>
        <DropiConnection readOnly={readOnly} toast={toast} />
        <DropiWebConnection readOnly={readOnly} toast={toast} />
      </div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 10 }}>Herramientas Oficiales Dropi MCP (https://mcp.dropi.co/mcp)</h3>
        {[
          ['create_order', 'Crear pedido real en Dropi Chile (CON RECAUDO / SIN RECAUDO) directo desde Pedidos Landings', 'Activo · Creación Directa'],
          ['quote_shipping', 'Cotizar costo de envío y transportadoras (Blue Express, Veloces, Starken, Wiilog) por comuna', 'Activo · Cotizador'],
          ['search_cities / list_departments', 'Resolver código de comuna y región oficial de Dropi Chile automáticamente', 'Activo · Logística'],
          ['list_products', 'Consultar catálogo, stock por variante y variation_id en Dropi Chile', 'Activo · Catálogo'],
          ['get_customer_fingerprint_profile', 'Consultar probabilidad de entrega y riesgo del comprador por teléfono', 'Activo · Antifraude COD'],
          ['get_order / list_orders', 'Sincronizar estado de pedidos, guías de seguimiento y transportadora', 'Activo · Sincronización'],
        ].map(([a, b, badge]) => (
          <div className="item" key={a}>
            <div className="productIcon"><Bot size={18} /></div>
            <div className="grow"><b>{a}</b><small>{b}</small></div>
            <span className="tag success">{badge}</span>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3 style={{ marginBottom: 10 }}>Herramientas Internas Nexora MCP</h3>
        {[
          ['buscar_producto', 'Buscar por cualquier identificador o SKU maestro'],
          ['consultar_stock', 'Consultar físico, reservado y disponible en tiempo real'],
          ['buscar_equivalencias', 'Listar códigos vinculados por canal (Jumpseller, Evolut, Dropi, Walmart, Landings)'],
          ['listar_stock_bajo', 'Detectar productos bajo umbral de seguridad'],
        ].map(([a, b]) => (
          <div className="item" key={a}>
            <div className="productIcon"><Bot size={18} /></div>
            <div className="grow"><b>{a}</b><small>{b}</small></div>
            <span className="tag neutral">Activo · Lectura</span>
          </div>
        ))}
      </div>
    </>
  );
}

export const McpCenter = Mcp;

export function UserList({ users = [] }) {
  return (
    <>
      <Heading eyebrow="CONTROL DE ACCESO" title="Usuarios y roles" subtitle="Sesiones reales y permisos validados por el backend." />
      <div className="grid2">
        <div className="panel"><Users /><h3>Administrador</h3><p>Gestiona productos, variantes, stock, equivalencias, movimientos y ventas locales.</p></div>
        <div className="panel"><ScanBarcode /><h3>Empaquetador</h3><p>Busca y verifica productos. Los endpoints administrativos rechazan este rol.</p></div>
      </div>
      <div className="panel historyPanel">
        <div className="tableWrap">
          <table>
            <thead><tr><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.role === 'admin' ? 'Administrador' : 'Empaquetador'}</td>
                  <td>{u.active ? 'Activo' : 'Inactivo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function Settings({ readOnly, toast }) {
  return (
    <>
      <Heading eyebrow="CONFIGURACIÓN" title="Ajustes generales" subtitle="Conexiones externas, automatizaciones y datos del negocio." />
      <div className="settingsConnectionGroup">
        <DropiConnection readOnly={readOnly} toast={toast} />
        <DropiWebConnection readOnly={readOnly} toast={toast} />
        <WhatsAppConnection readOnly={readOnly} toast={toast} />
      </div>
      <JumpsellerPreparationConnection readOnly={readOnly} toast={toast} />
      <details className="panel settingsAccordion">
        <summary>Información del sistema · Identidad de Nexora</summary>
        <div className="panel">
          <h3>Identidad de Nexora</h3>
          <p>Logo oficial, notificaciones en vivo y motor comercial multicanal.</p>
          {[
            ['Sistema', 'Nexora Marketplace & POS'],
            ['Moneda del POS', 'CLP ($ peso chileno)'],
            ['Persistencia', 'SQLite local con respaldo transaccional'],
            ['Stock disponible', 'Físico − reservado'],
            ['Reserva de pedidos', 'Unidades apartadas para pedidos'],
            ['Colchón de seguridad', 'Referencia por producto · No aparta unidades'],
            ['Alerta de stock bajo', 'Umbral configurable por producto'],
            ['Canales integrados', 'Landings COD, Jumpseller, Evolut, Dropi, Dropea, Walmart, POS'],
          ].map(([label, value]) => (
            <div className="item" key={label}>
              <b>{label}</b>
              <span className="grow" />
              <span className="tag neutral">{value}</span>
            </div>
          ))}
        </div>
      </details>
      <details className="panel settingsAccordion" open>
        <summary>Datos de empresa para comprobantes</summary>
        <BusinessSettings embedded readOnly={readOnly} toast={toast} />
      </details>
    </>
  );
}
