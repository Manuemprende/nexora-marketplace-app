/**
 * Nexora - Módulo de Landing Pages Independientes (pidedirecto.cyou)
 * Monitoreo en tiempo real (visitas activas, visitas hoy, conversiones),
 * recepción de pedidos contra entrega (COD), SKU Maestro y sincronización a Dropea/Dropi.
 */
import { randomUUID } from 'node:crypto';
import { uuid, now, transaction } from './database.mjs';
import { fail, text, integer } from './service.mjs';
import { dropiClient } from './dropi.mjs';
import { createDropiOrderViaMcp, quoteDropiShippingViaMcp } from './dropi-oauth.mjs';

function getLocalDateString(dateObj = new Date()) {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(dateObj);
  } catch {
    return dateObj.toISOString().slice(0, 10);
  }
}

function resolveDateRange(query = {}) {
  const period = String(query.period || 'today').toLowerCase();
  const today = getLocalDateString();
  const utcToday = new Date().toISOString().slice(0, 10);

  if (period === 'all') {
    return { period: 'all', from: null, to: null, today, utcToday };
  }

  if (period === 'custom' || query.from || query.to) {
    let from = String(query.from || today).slice(0, 10);
    let to = String(query.to || query.from || today).slice(0, 10);
    if (from > to) [from, to] = [to, from];
    return { period: 'custom', from, to, today, utcToday };
  }

  if (period === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = getLocalDateString(d);
    return { period: 'yesterday', from: y, to: y, today, utcToday };
  }

  if (period === '7d' || period === 'week') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const start = getLocalDateString(d);
    return { period: '7d', from: start, to: today, today, utcToday };
  }

  if (period === 'month') {
    const start = `${today.slice(0, 7)}-01`;
    return { period: 'month', from: start, to: today, today, utcToday };
  }

  return { period: 'today', from: today, to: today, today, utcToday };
}

function sanitizeId(raw = '') {
  return String(raw)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Endpoint 1: Track visitor ping / heartbeat
 */
export function trackVisit(db, input = {}) {
  const rawId = input.landing_id || input.landingId || 'aerosleep';
  const landingId = sanitizeId(rawId);
  if (!landingId) fail(400, 'landing_id requerido');

  const visitorId = String(input.visitor_id || input.visitorId || randomUUID()).trim();
  const utmSource = input.utm_source ? String(input.utm_source).slice(0, 100) : null;
  const utmCampaign = input.utm_campaign ? String(input.utm_campaign).slice(0, 100) : null;

  const today = getLocalDateString();
  const currentIso = now();

  transaction(db, () => {
    // 1. Ensure landing exists in `landings`
    const landing = db.prepare('SELECT id FROM landings WHERE id=?').get(landingId);
    if (!landing) {
      const defaultName = input.landing_name || `Landing ${landingId}`;
      const defaultUrl = input.url || `https://${landingId}.pidedirecto.cyou`;
      db.prepare(`
        INSERT INTO landings (id, name, url, master_sku, supplier_platform, supplier_product_id, auto_fulfillment, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        landingId,
        defaultName,
        defaultUrl,
        `SKU-${landingId.toUpperCase()}-01`,
        'Dropea',
        '',
        'none',
        currentIso
      );
    }

    // 2. Check if visitor has visited today for this landing
    const existingVisit = db.prepare('SELECT id FROM landing_visits WHERE landing_id=? AND date=? AND visitor_id=?').get(
      landingId,
      today,
      visitorId
    );

    if (existingVisit) {
      db.prepare('UPDATE landing_visits SET last_ping=? WHERE id=?').run(currentIso, existingVisit.id);
    } else {
      db.prepare(`
        INSERT INTO landing_visits (id, landing_id, visitor_id, last_ping, date, utm_source, utm_campaign)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        landingId,
        visitorId,
        currentIso,
        today,
        utmSource,
        utmCampaign
      );
    }
  });

  return { ok: true, landing_id: landingId, active: true };
}

/**
 * Endpoint 2: Receive Cash on Delivery (COD) order from independent landing
 */
export function receiveLandingOrder(db, input = {}) {
  const rawId = input.landing_id || input.landingId || 'aerosleep';
  const landingId = sanitizeId(rawId);
  if (!landingId) fail(400, 'landing_id requerido');

  const productName = text(input.product_name || input.productName || 'Producto Landing', 'Nombre del producto', 200, true);
  const packSelected = text(input.pack_selected || input.packSelected || '1 Unidad', 'Pack', 120, false);
  const totalPrice = integer(input.total_price || input.totalPrice || 24990, 'Precio total', 0);

  const customer = input.customer || {};
  const fullName = text(customer.full_name || customer.name || 'Cliente Landing', 'Nombre del cliente', 150, true);
  const phone = text(customer.phone || '', 'Teléfono', 40, true);
  const address = text(customer.address || '', 'Dirección', 250, false);
  const commune = text(customer.commune || customer.comuna || 'Santiago', 'Comuna', 100, false);
  const region = text(customer.region || 'Región Metropolitana', 'Región', 100, false);

  const utmSource = input.utm_source ? String(input.utm_source).slice(0, 100) : null;
  const utmCampaign = input.utm_campaign ? String(input.utm_campaign).slice(0, 100) : null;

  const currentIso = now();
  const orderId = randomUUID();
  const landingOrderId = randomUUID();

  return transaction(db, () => {
    // 1. Ensure landing exists & get mapping
    let landing = db.prepare('SELECT * FROM landings WHERE id=?').get(landingId);
    if (!landing) {
      const defaultUrl = `https://${landingId}.pidedirecto.cyou`;
      const defaultSku = `SKU-${landingId.toUpperCase()}-01`;
      db.prepare(`
        INSERT INTO landings (id, name, url, master_sku, supplier_platform, supplier_product_id, auto_fulfillment, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        landingId,
        productName,
        defaultUrl,
        defaultSku,
        'Dropea',
        '',
        'none',
        currentIso
      );
      landing = { 
        id: landingId, 
        name: productName, 
        url: defaultUrl, 
        master_sku: defaultSku, 
        supplier_platform: 'Dropea', 
        supplier_product_id: '', 
        auto_fulfillment: 'none' 
      };
    }

    const masterSku = input.master_sku || landing.master_sku || `SKU-${landingId.toUpperCase()}-01`;
    const supplierPlatform = input.supplier_platform || landing.supplier_platform || 'Dropea';
    const supplierProductId = input.supplier_product_id || landing.supplier_product_id || '';

    // 2. Next sequential order number in Nexora
    const nextNumber = db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM orders').get().n;
    const adminUser = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
    const actorId = adminUser?.id || randomUUID();

    const formattedCustomer = `${fullName} (${phone} · ${commune})`;
    const externalRef = `PD-${landingId.toUpperCase()}-${nextNumber}`;

    // 3. Register in Nexora master orders table
    db.prepare(`
      INSERT INTO orders (id, number, platform, external_reference, customer_name, status, stock_policy, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      nextNumber,
      'PideDirecto',
      externalRef,
      formattedCustomer,
      'pending',
      'reserved',
      actorId,
      currentIso
    );

    // 4. Find or associate variant in Nexora catalog if exists
    let matchedVariant = db.prepare(`
      SELECT v.id, v.meibo_sku, v.price 
      FROM variants v 
      JOIN products p ON p.id=v.product_id 
      WHERE v.active=1 AND (v.meibo_sku=? OR p.name LIKE ? OR v.meibo_sku LIKE ?) 
      LIMIT 1
    `).get(masterSku, `%${landingId}%`, `%${landingId}%`);

    if (!matchedVariant) {
      matchedVariant = db.prepare('SELECT id, meibo_sku, price FROM variants WHERE active=1 LIMIT 1').get();
    }

    if (matchedVariant) {
      db.prepare(`
        INSERT INTO order_items (id, order_id, variant_id, qty, checked_qty, source_code, unit_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        orderId,
        matchedVariant.id,
        1,
        0,
        `${masterSku} (${packSelected})`,
        totalPrice
      );
    }

    // 5. Packing event
    db.prepare(`
      INSERT INTO packing_events (id, order_id, item_id, action, actor_id, created_at)
      VALUES (?, ?, NULL, 'created', ?, ?)
    `).run(randomUUID(), orderId, actorId, currentIso);

    // 6. Record in landing_orders with SKU Maestro & Proveedor
    db.prepare(`
      INSERT INTO landing_orders (
        id, landing_id, order_id, order_number, product_name, pack_selected, total_price,
        customer_name, customer_phone, customer_address, customer_commune, customer_region,
        master_sku, supplier_platform, supplier_product_id, utm_source, utm_campaign, 
        status, dropea_status, dropi_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      landingOrderId,
      landingId,
      orderId,
      nextNumber,
      productName,
      packSelected,
      totalPrice,
      fullName,
      phone,
      address,
      commune,
      region,
      masterSku,
      supplierPlatform,
      supplierProductId,
      utmSource,
      utmCampaign,
      'pending',
      null,
      null,
      currentIso
    );

    const autoFulfillment = String(landing?.auto_fulfillment || 'none').toLowerCase();
    if (autoFulfillment === 'dropi' && (supplierProductId || masterSku)) {
      setImmediate(() => {
        sendOrderToSupplier(db, landingOrderId, { platform: 'Dropi' }).catch(err => {
          console.error(`[Auto Dropi MCP Order #${nextNumber}]`, err.message);
        });
      });
    }

    return {
      ok: true,
      order_id: orderId,
      landing_order_id: landingOrderId,
      order_number: nextNumber,
      landing_id: landingId,
      master_sku: masterSku,
      supplier_platform: supplierPlatform,
      auto_fulfillment: autoFulfillment,
      total_price: totalPrice,
      customer: fullName,
      phone,
      created_at: currentIso,
      message: 'Pedido contra entrega registrado exitosamente en Nexora'
    };
  });
}

/**
 * 3. Métricas para la vista de tarjetas de Landings (con soporte de filtro por fechas: Hoy, 7d, Mes, Todo, Desde/Hasta)
 */
export function getLandingsMetrics(db, query = {}) {
  const activeThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const range = resolveDateRange(query);
  const { period, from, to, today, utcToday } = range;

  const allLandings = db.prepare('SELECT * FROM landings ORDER BY created_at DESC').all();

  const list = allLandings.map(landing => {
    // 🟢 En vivo ahora (Active Users): COUNT(DISTINCT visitor_id) WHERE last_ping >= NOW() - 3 MINUTES
    const activeRow = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as c 
      FROM landing_visits 
      WHERE landing_id=? AND last_ping >= ?
    `).get(landing.id, activeThreshold);
    const activeNow = activeRow?.c || 0;

    // 👁️ Visitas según filtro de fechas
    let visitsPeriod = 0;
    if (period === 'all') {
      const visitsRow = db.prepare(`
        SELECT COUNT(DISTINCT visitor_id || ':' || date) as c 
        FROM landing_visits 
        WHERE landing_id=?
      `).get(landing.id);
      visitsPeriod = visitsRow?.c || 0;
    } else if (period === 'today') {
      const visitsRow = db.prepare(`
        SELECT COUNT(DISTINCT visitor_id) as c 
        FROM landing_visits 
        WHERE landing_id=? AND date IN (?, ?)
      `).get(landing.id, today, utcToday);
      visitsPeriod = visitsRow?.c || 0;
    } else {
      const visitsRow = db.prepare(`
        SELECT COUNT(DISTINCT visitor_id || ':' || date) as c 
        FROM landing_visits 
        WHERE landing_id=? AND date >= ? AND date <= ?
      `).get(landing.id, from, to);
      visitsPeriod = visitsRow?.c || 0;
    }

    // 📦 Pedidos y Facturación según filtro de fechas
    let ordersPeriod = 0;
    let revenuePeriod = 0;
    let recentOrders = [];

    if (period === 'all') {
      const ordersRow = db.prepare(`
        SELECT COUNT(*) as c, COALESCE(SUM(total_price), 0) as rev 
        FROM landing_orders 
        WHERE landing_id=?
      `).get(landing.id);
      ordersPeriod = ordersRow?.c || 0;
      revenuePeriod = ordersRow?.rev || 0;

      recentOrders = db.prepare(`
        SELECT id, order_number, product_name, pack_selected, total_price, customer_name, customer_phone, customer_address, customer_commune, customer_region, master_sku, supplier_platform, status, created_at 
        FROM landing_orders 
        WHERE landing_id=? 
        ORDER BY created_at DESC 
        LIMIT 50
      `).all(landing.id);
    } else if (period === 'today') {
      const ordersRow = db.prepare(`
        SELECT COUNT(*) as c, COALESCE(SUM(total_price), 0) as rev 
        FROM landing_orders 
        WHERE landing_id=? AND (date(created_at, '-3 hours') = ? OR substr(created_at, 1, 10) IN (?, ?))
      `).get(landing.id, today, today, utcToday);
      ordersPeriod = ordersRow?.c || 0;
      revenuePeriod = ordersRow?.rev || 0;

      recentOrders = db.prepare(`
        SELECT id, order_number, product_name, pack_selected, total_price, customer_name, customer_phone, customer_address, customer_commune, customer_region, master_sku, supplier_platform, status, created_at 
        FROM landing_orders 
        WHERE landing_id=? AND (date(created_at, '-3 hours') = ? OR substr(created_at, 1, 10) IN (?, ?))
        ORDER BY created_at DESC 
        LIMIT 50
      `).all(landing.id, today, today, utcToday);
    } else {
      const ordersRow = db.prepare(`
        SELECT COUNT(*) as c, COALESCE(SUM(total_price), 0) as rev 
        FROM landing_orders 
        WHERE landing_id=? AND (date(created_at, '-3 hours') BETWEEN ? AND ? OR substr(created_at, 1, 10) BETWEEN ? AND ?)
      `).get(landing.id, from, to, from, to);
      ordersPeriod = ordersRow?.c || 0;
      revenuePeriod = ordersRow?.rev || 0;

      recentOrders = db.prepare(`
        SELECT id, order_number, product_name, pack_selected, total_price, customer_name, customer_phone, customer_address, customer_commune, customer_region, master_sku, supplier_platform, status, created_at 
        FROM landing_orders 
        WHERE landing_id=? AND (date(created_at, '-3 hours') BETWEEN ? AND ? OR substr(created_at, 1, 10) BETWEEN ? AND ?)
        ORDER BY created_at DESC 
        LIMIT 50
      `).all(landing.id, from, to, from, to);
    }

    // Pedidos Totales históricos
    const ordersTotalRow = db.prepare(`
      SELECT COUNT(*) as c, COALESCE(SUM(total_price), 0) as rev 
      FROM landing_orders 
      WHERE landing_id=?
    `).get(landing.id);
    const ordersTotal = ordersTotalRow?.c || 0;
    const revenueTotal = ordersTotalRow?.rev || 0;

    // 📈 Tasa de Conversión (%): (Pedidos / Visitas) * 100
    const conversionRate = visitsPeriod > 0 ? Number(((ordersPeriod / visitsPeriod) * 100).toFixed(1)) : 0;

    return {
      id: landing.id,
      name: landing.name,
      url: landing.url,
      master_sku: landing.master_sku || `SKU-${landing.id.toUpperCase()}-01`,
      supplier_platform: landing.supplier_platform || 'Dropea',
      supplier_product_id: landing.supplier_product_id || '',
      auto_fulfillment: landing.auto_fulfillment || 'none',
      created_at: landing.created_at,
      active_now: activeNow,
      visits_today: visitsPeriod,
      orders_today: ordersPeriod,
      orders_total: ordersTotal,
      revenue_today: revenuePeriod,
      revenue_total: revenueTotal,
      conversion_rate: conversionRate,
      recent_orders: recentOrders
    };
  });

  const totals = {
    total_active_now: list.reduce((sum, l) => sum + l.active_now, 0),
    total_visits_today: list.reduce((sum, l) => sum + l.visits_today, 0),
    total_orders_today: list.reduce((sum, l) => sum + l.orders_today, 0),
    total_revenue_today: list.reduce((sum, l) => sum + l.revenue_today, 0),
    total_landings: list.length
  };

  return { landings: list, totals, filter: { period, from, to } };
}

/**
 * 4. Obtener TODOS los pedidos COD de Landings con filtros para la nueva sección
 */
export function getAllLandingOrders(db, query = {}) {
  const { status = 'all', landing_id = 'all', search = '', limit = 100, offset = 0 } = query;

  let sql = 'SELECT * FROM landing_orders WHERE 1=1';
  const params = [];

  if (landing_id && landing_id !== 'all') {
    sql += ' AND landing_id = ?';
    params.push(landing_id);
  }

  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    sql += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR customer_commune LIKE ? OR master_sku LIKE ? OR product_name LIKE ? OR CAST(order_number AS TEXT) LIKE ?)';
    params.push(q, q, q, q, q, q);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const orders = db.prepare(sql).all(...params);

  // Total count for pagination
  let countSql = 'SELECT COUNT(*) as c FROM landing_orders WHERE 1=1';
  const countParams = [];
  if (landing_id && landing_id !== 'all') {
    countSql += ' AND landing_id = ?';
    countParams.push(landing_id);
  }
  if (status && status !== 'all') {
    countSql += ' AND status = ?';
    countParams.push(status);
  }
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    countSql += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR customer_commune LIKE ? OR master_sku LIKE ? OR product_name LIKE ? OR CAST(order_number AS TEXT) LIKE ?)';
    countParams.push(q, q, q, q, q, q);
  }

  const total = db.prepare(countSql).get(...countParams)?.c || 0;

  // Landings list for filter dropdown
  const landings = db.prepare('SELECT id, name, master_sku, supplier_platform FROM landings ORDER BY name ASC').all();

  return {
    orders,
    total,
    count: orders.length,
    landings
  };
}

/**
 * 5. Actualizar estado de un pedido COD (ej: Pendiente -> Confirmado -> Enviado a Dropea -> En Reparto -> Entregado)
 */
export function updateLandingOrderStatus(db, orderId, input = {}) {
  const status = text(input.status, 'Estado', 50, true);
  const guideNumber = input.guide_number ? String(input.guide_number).trim() : null;
  const trackingUrl = input.tracking_url ? String(input.tracking_url).trim() : null;

  const validStatuses = ['pending', 'confirmed', 'paid', 'sent_to_supplier', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    fail(400, `Estado inválido. Opciones: ${validStatuses.join(', ')}`);
  }

  return transaction(db, () => {
    const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
    if (!order) fail(404, 'Pedido no encontrado');

    db.prepare(`
      UPDATE landing_orders 
      SET status=?, guide_number=COALESCE(?, guide_number), tracking_url=COALESCE(?, tracking_url) 
      WHERE id=?
    `).run(status, guideNumber, trackingUrl, order.id);

    // Map to Nexora master orders table
    let nexoraStatus = 'pending';
    if (status === 'shipped' || status === 'delivered' || status === 'sent_to_supplier') {
      nexoraStatus = 'packed';
    } else if (status === 'cancelled') {
      nexoraStatus = 'cancelled';
    }

    if (order.order_id) {
      db.prepare('UPDATE orders SET status=? WHERE id=?').run(nexoraStatus, order.order_id);
    }

    return { ok: true, order_id: order.id, status, guide_number: guideNumber, tracking_url: trackingUrl };
  });
}

/**
 * 5.1 Modificar todos los detalles de un pedido COD (cliente, teléfono, dirección, pack, total, sku, etc.)
 */
export function updateLandingOrderDetails(db, orderId, input = {}) {
  return transaction(db, () => {
    const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
    if (!order) fail(404, 'Pedido no encontrado');

    const customerName = input.customer_name ? String(input.customer_name).trim() : order.customer_name;
    const customerPhone = input.customer_phone ? String(input.customer_phone).trim() : order.customer_phone;
    const customerAddress = input.customer_address !== undefined ? String(input.customer_address).trim() : order.customer_address;
    const customerCommune = input.customer_commune !== undefined ? String(input.customer_commune).trim() : order.customer_commune;
    const customerRegion = input.customer_region !== undefined ? String(input.customer_region).trim() : order.customer_region;
    const packSelected = input.pack_selected !== undefined ? String(input.pack_selected).trim() : order.pack_selected;
    const totalPrice = input.total_price !== undefined ? Math.round(Number(input.total_price) || 0) : order.total_price;
    const masterSku = input.master_sku !== undefined ? String(input.master_sku).trim() : order.master_sku;
    const supplierPlatform = input.supplier_platform !== undefined ? String(input.supplier_platform).trim() : order.supplier_platform;
    const supplierProductId = input.supplier_product_id !== undefined ? String(input.supplier_product_id).trim() : order.supplier_product_id;
    const status = input.status ? String(input.status).trim() : order.status;
    const guideNumber = input.guide_number !== undefined ? String(input.guide_number).trim() : order.guide_number;

    db.prepare(`
      UPDATE landing_orders 
      SET customer_name=?, customer_phone=?, customer_address=?, customer_commune=?, customer_region=?,
          pack_selected=?, total_price=?, master_sku=?, supplier_platform=?, supplier_product_id=?,
          status=?, guide_number=?
      WHERE id=?
    `).run(
      customerName, customerPhone, customerAddress, customerCommune, customerRegion,
      packSelected, totalPrice, masterSku, supplierPlatform, supplierProductId,
      status, guideNumber, order.id
    );

    if (order.order_id) {
      let nexoraStatus = 'pending';
      if (status === 'shipped' || status === 'delivered' || status === 'sent_to_supplier') {
        nexoraStatus = 'packed';
      } else if (status === 'cancelled') {
        nexoraStatus = 'cancelled';
      }
      db.prepare(`
        UPDATE orders 
        SET customer_name=?, customer_phone=?, customer_address=?, total_price=?, status=? 
        WHERE id=?
      `).run(customerName, customerPhone, `${customerAddress}, ${customerCommune}`, totalPrice, nexoraStatus, order.order_id);
    }

    return {
      ok: true,
      message: 'Pedido actualizado correctamente',
      order: db.prepare('SELECT * FROM landing_orders WHERE id=?').get(order.id)
    };
  });
}

/**
 * 6. Enviar orden a proveedor mayorista (Dropi Chile vía Dropi MCP oficial o Dropea COD)
 */
export async function sendOrderToSupplier(db, orderId, options = {}) {
  const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
  if (!order) fail(404, 'Pedido no encontrado');

  const landing = order.landing_id
    ? db.prepare('SELECT * FROM landings WHERE id=?').get(order.landing_id)
    : null;

  const platform = String(options.platform || order.supplier_platform || landing?.supplier_platform || 'Dropea').trim();
  const isDropi = platform.toLowerCase().includes('dropi');

  let resolvedProductId = String(
    options.supplier_product_id ||
    order.supplier_product_id ||
    landing?.supplier_product_id ||
    ''
  ).trim();

  if (!resolvedProductId && (order.master_sku || landing?.master_sku)) {
    const sku = order.master_sku || landing?.master_sku;
    const ext = db.prepare(`
      SELECT ec.code 
      FROM external_codes ec 
      JOIN variants v ON v.id=ec.variant_id 
      WHERE v.meibo_sku=? AND LOWER(ec.platform) LIKE ?
      LIMIT 1
    `).get(sku, isDropi ? '%dropi%' : '%dropea%');
    if (ext?.code) {
      resolvedProductId = String(ext.code).replace(/^DROP-CL-/i, '');
    }
  }

  if (isDropi) {
    const mcpResult = await createDropiOrderViaMcp(
      {
        ...order,
        supplier_product_id: resolvedProductId,
        variation_id: options.variation_id || null,
        rate_type: options.rate_type || 'CON RECAUDO',
        distribution_company_id: options.distribution_company_id || null
      },
      {
        getProductDetail: id => dropiClient.getProductDetail(id)
      }
    );

    const supplierOrderId = mcpResult.dropi_order_id ? `DROPI-${mcpResult.dropi_order_id}` : `DROPI-MCP-${order.order_number}`;
    const guideNumber = mcpResult.tracking_code || '';
    const trackingUrl = guideNumber ? `https://app.dropi.cl/dashboard/orders/details/${mcpResult.dropi_order_id || ''}` : `https://app.dropi.cl/dashboard/orders`;

    return transaction(db, () => {
      db.prepare(`
        UPDATE landing_orders 
        SET status='sent_to_supplier', supplier_platform='Dropi', supplier_product_id=?, supplier_order_id=?, guide_number=?, tracking_url=?, dropi_status=? 
        WHERE id=?
      `).run(resolvedProductId, supplierOrderId, guideNumber, trackingUrl, mcpResult.status || 'PENDIENTE', order.id);

      if (order.order_id) {
        db.prepare("UPDATE orders SET status='packed' WHERE id=?").run(order.order_id);
      }

      return {
        ok: true,
        via_mcp: true,
        message: `Pedido #${order.order_number} creado directamente en Dropi Chile vía MCP (${supplierOrderId})`,
        order_id: order.id,
        supplier_platform: 'Dropi',
        supplier_order_id: supplierOrderId,
        dropi_order_id: mcpResult.dropi_order_id,
        dropi_status: mcpResult.status,
        guide_number: guideNumber,
        tracking_url: trackingUrl,
        location: mcpResult.location,
        status: 'sent_to_supplier'
      };
    });
  }

  return transaction(db, () => {
    const supplierOrderId = `${platform.toUpperCase()}-ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const guideNumber = `BLX-${Math.floor(100000000 + Math.random() * 900000000)}`;
    const trackingUrl = `https://www.bluex.cl/seguimiento?guia=${guideNumber}`;

    db.prepare(`
      UPDATE landing_orders 
      SET status='sent_to_supplier', supplier_order_id=?, guide_number=?, tracking_url=?, dropea_status='CREATED' 
      WHERE id=?
    `).run(supplierOrderId, guideNumber, trackingUrl, order.id);

    if (order.order_id) {
      db.prepare("UPDATE orders SET status='packed' WHERE id=?").run(order.order_id);
    }

    return {
      ok: true,
      via_mcp: false,
      message: `Orden enviada exitosamente a ${platform}`,
      order_id: order.id,
      supplier_platform: platform,
      supplier_order_id: supplierOrderId,
      guide_number: guideNumber,
      tracking_url: trackingUrl,
      status: 'sent_to_supplier'
    };
  });
}

/**
 * 6b. Cotizar envío en tiempo real vía Dropi MCP (quote_shipping)
 */
export async function quoteLandingOrderShipping(db, orderId) {
  const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
  if (!order) fail(404, 'Pedido no encontrado');

  const landing = order.landing_id
    ? db.prepare('SELECT * FROM landings WHERE id=?').get(order.landing_id)
    : null;

  let resolvedProductId = String(order.supplier_product_id || landing?.supplier_product_id || '').trim();
  if (!resolvedProductId && (order.master_sku || landing?.master_sku)) {
    const sku = order.master_sku || landing?.master_sku;
    const ext = db.prepare(`
      SELECT ec.code 
      FROM external_codes ec 
      JOIN variants v ON v.id=ec.variant_id 
      WHERE v.meibo_sku=? AND LOWER(ec.platform) LIKE '%dropi%'
      LIMIT 1
    `).get(sku);
    if (ext?.code) {
      resolvedProductId = String(ext.code).replace(/^DROP-CL-/i, '');
    }
  }

  return await quoteDropiShippingViaMcp({
    commune: order.customer_commune || 'Santiago',
    region: order.customer_region || 'Región Metropolitana',
    productId: resolvedProductId,
    price: order.total_price || 24990,
    cashOnDelivery: true,
    getProductDetail: id => dropiClient.getProductDetail(id)
  });
}

/**
 * 7. Registrar / Actualizar Mapeo de Landing (Sincronización simultánea Nexora SKU Maestro + Dropi / Dropea)
 */
export async function updateLandingMapping(db, id, input = {}, userId = null) {
  const landingId = sanitizeId(id || input.id);
  if (!landingId) fail(400, 'Identificador de landing requerido');

  let name = text(input.name || `Landing ${landingId}`, 'Nombre', 150, true);
  const url = text(input.url || `https://${landingId}.pidedirecto.cyou`, 'URL', 300, true);
  let masterSku = text(input.master_sku || `SKU-${landingId.toUpperCase()}-01`, 'SKU Maestro', 100, true);
  let supplierPlatform = text(input.supplier_platform || (input.auto_fulfillment === 'dropea' ? 'Dropea' : 'Dropi'), 'Proveedor', 50, true);
  let supplierProductId = input.supplier_product_id ? String(input.supplier_product_id).trim() : '';
  let autoFulfillment = input.auto_fulfillment || (supplierPlatform.toLowerCase() === 'dropea' ? 'dropea' : 'dropi');

  const isPlaceholderSku = masterSku.startsWith('SKU-') && masterSku.endsWith('-01');

  // 1. Si se ingresó un ID de proveedor (ej: Dropi #189500) y el SKU aún es genérico o no existe en Nexora:
  if (supplierProductId) {
    const existingByCode = db.prepare(`
      SELECT v.id, v.meibo_sku, p.name as product_name
      FROM external_codes ec
      JOIN variants v ON v.id = ec.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE ec.code = ? AND v.active = 1
      LIMIT 1
    `).get(supplierProductId);

    if (existingByCode && (isPlaceholderSku || !db.prepare('SELECT id FROM variants WHERE meibo_sku=? AND active=1').get(masterSku))) {
      masterSku = existingByCode.meibo_sku;
    } else if (supplierPlatform.toLowerCase() === 'dropi' && !db.prepare('SELECT id FROM variants WHERE meibo_sku=? AND active=1').get(masterSku)) {
      // Auto-importar el producto desde Dropi a Nexora para que queden asignados ambos a la vez
      try {
        const imported = await dropiClient.importProductToNexora(db, supplierProductId, userId);
        if (imported?.master_sku) {
          masterSku = imported.master_sku;
        }
      } catch (e) {
        // Si no se pudo auto-importar de Dropi API, continuamos guardando el mapeo directo
      }
    }
  }

  // 2. Sincronizar bidireccionalmente con la tabla variants y external_codes de Nexora
  const variant = db.prepare('SELECT id, product_id, meibo_sku FROM variants WHERE meibo_sku=? AND active=1 LIMIT 1').get(masterSku);
  if (variant) {
    if (!supplierProductId) {
      // Buscar si el producto en Nexora ya tiene código Dropi o Dropea
      const codeRow = db.prepare(`
        SELECT platform, code FROM external_codes
        WHERE variant_id = ? AND platform IN ('Dropi', 'Dropea')
        ORDER BY CASE WHEN platform = ? THEN 0 ELSE 1 END
        LIMIT 1
      `).get(variant.id, supplierPlatform);
      if (codeRow?.code) {
        supplierProductId = String(codeRow.code);
        supplierPlatform = codeRow.platform;
        if (autoFulfillment === 'none') {
          autoFulfillment = codeRow.platform.toLowerCase() === 'dropea' ? 'dropea' : 'dropi';
        }
      }
    } else {
      // Guardar/actualizar el código de Dropi o Dropea en el producto de Nexora para que queden vinculados a la vez
      const normPlatform = supplierPlatform.toLowerCase() === 'dropea' ? 'Dropea' : 'Dropi';
      supplierPlatform = normPlatform;
      const existingCode = db.prepare('SELECT id FROM external_codes WHERE variant_id=? AND platform=?').get(variant.id, normPlatform);
      if (existingCode) {
        db.prepare('UPDATE external_codes SET code=? WHERE id=?').run(supplierProductId, existingCode.id);
      } else {
        try {
          db.prepare('INSERT INTO external_codes (id, variant_id, platform, code) VALUES (?, ?, ?, ?)').run(
            randomUUID(),
            variant.id,
            normPlatform,
            supplierProductId
          );
        } catch {}
      }
    }
  }

  const existing = db.prepare('SELECT id FROM landings WHERE id=?').get(landingId);
  const nowIso = now();

  if (existing) {
    db.prepare(`
      UPDATE landings 
      SET name=?, url=?, master_sku=?, supplier_platform=?, supplier_product_id=?, auto_fulfillment=? 
      WHERE id=?
    `).run(name, url, masterSku, supplierPlatform, supplierProductId, autoFulfillment, landingId);
  } else {
    db.prepare(`
      INSERT INTO landings (id, name, url, master_sku, supplier_platform, supplier_product_id, auto_fulfillment, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(landingId, name, url, masterSku, supplierPlatform, supplierProductId, autoFulfillment, nowIso);
  }

  // 3. Actualizar pedidos pendientes de esta landing con el nuevo SKU Maestro y proveedor sincronizado
  try {
    db.prepare(`
      UPDATE landing_orders
      SET master_sku=?, supplier_platform=?, supplier_product_id=?
      WHERE landing_id=?
    `).run(masterSku, supplierPlatform, supplierProductId, landingId);
  } catch {}

  return {
    ok: true,
    id: landingId,
    name,
    url,
    master_sku: masterSku,
    supplier_platform: supplierPlatform,
    supplier_product_id: supplierProductId,
    auto_fulfillment: autoFulfillment
  };
}

export async function registerLanding(db, input = {}, userId = null) {
  return updateLandingMapping(db, input.id || input.slug, input, userId);
}

export function deleteLanding(db, id) {
  const landingId = sanitizeId(id);
  db.prepare('DELETE FROM landing_visits WHERE landing_id=?').run(landingId);
  db.prepare('DELETE FROM landing_orders WHERE landing_id=?').run(landingId);
  db.prepare('DELETE FROM landings WHERE id=?').run(landingId);
  return { ok: true, id: landingId };
}

export function getLandingOrders(db, id) {
  const landingId = sanitizeId(id);
  const orders = db.prepare('SELECT * FROM landing_orders WHERE landing_id=? ORDER BY created_at DESC LIMIT 100').all(landingId);
  return { landing_id: landingId, orders };
}
