/**
 * Nexora - Módulo de Landing Pages Independientes (pidedirecto.cyou)
 * Monitoreo en tiempo real (visitas activas, visitas hoy, conversiones),
 * recepción de pedidos contra entrega (COD), confirmación WhatsApp auditada,
 * validación pre-despacho y sincronización real a Dropi MCP / Bodega.
 */
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { uuid, now, transaction } from './database.mjs';
import { fail, text, integer } from './service.mjs';
import { dropiClient } from './dropi.mjs';
import { createDropiOrderViaMcp, quoteDropiShippingViaMcp } from './dropi-oauth.mjs';

export const VALID_LANDING_STATUSES = [
  'pending',
  'awaiting_confirmation',
  'confirmed',
  'needs_review',
  'cancelled',
  'sent_to_supplier',
  'supplier_error',
  'paid',
  'shipped',
  'delivered'
];

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

export function normalizeChilePhone(raw = '') {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('56') && digits.length >= 11) return digits;
  return `56${digits.replace(/^0+/, '')}`;
}

export function ensureLandingOrderSchema(db) {
  try {
    const cols = new Set(db.prepare("PRAGMA table_info('landing_orders')").all().map(c => c.name));
    if (cols.size > 0) {
      const additions = [
        ['confirmed_at', 'TEXT'],
        ['confirmation_source', 'TEXT'],
        ['confirmation_reply', 'TEXT'],
        ['confirmation_sent_at', 'TEXT'],
        ['idempotency_key', 'TEXT'],
        ['dispatch_error', 'TEXT'],
        ['supplier_order_id', 'TEXT'],
        ['guide_number', 'TEXT'],
        ['tracking_url', 'TEXT']
      ];
      for (const [col, type] of additions) {
        if (!cols.has(col)) {
          db.prepare(`ALTER TABLE landing_orders ADD COLUMN ${col} ${type}`).run();
        }
      }
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_confirmation_logs (
        id TEXT PRIMARY KEY,
        landing_order_id TEXT NOT NULL,
        order_number INTEGER,
        phone TEXT NOT NULL,
        direction TEXT NOT NULL,
        channel TEXT NOT NULL,
        message_text TEXT,
        parsed_intent TEXT,
        status_before TEXT,
        status_after TEXT,
        remote_message_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wa_conf_logs_order ON whatsapp_confirmation_logs(landing_order_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
        event_id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        phone TEXT,
        payload_json TEXT,
        processed_at TEXT NOT NULL
      );
    `);
  } catch {}
}

function logWhatsAppConfirmationEvent(db, entry) {
  ensureLandingOrderSchema(db);
  db.prepare(`
    INSERT INTO whatsapp_confirmation_logs (
      id, landing_order_id, order_number, phone, direction, channel,
      message_text, parsed_intent, status_before, status_after, remote_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    entry.landing_order_id,
    entry.order_number || null,
    entry.phone || '',
    entry.direction || 'operator',
    entry.channel || 'manual',
    entry.message_text || '',
    entry.parsed_intent || '',
    entry.status_before || '',
    entry.status_after || '',
    entry.remote_message_id || null,
    now()
  );
}

export function buildWhatsAppConfirmationMessage(order) {
  const totalFormatted = Number(order.total_price || 0).toLocaleString('es-CL');
  const addressPart = [order.customer_address, order.customer_commune, order.customer_region]
    .filter(Boolean)
    .join(', ');
  return (
    `¡Hola ${order.customer_name}! 👋 Te escribimos de *${order.product_name || 'nuestra tienda'}* por tu pedido contra entrega #${order.order_number || '1'}:\n\n` +
    `📦 *Producto:* ${order.pack_selected || '1 Unidad'}\n` +
    `💰 *Total a pagar al recibir:* $${totalFormatted}\n` +
    `📍 *Dirección de envío:* ${addressPart || 'Pendiente confirmar'}\n\n` +
    `Por favor responde a este mensaje:\n` +
    `✅ Responde *SÍ* para confirmar tu pedido y dirección exacta.\n` +
    `❌ Responde *NO* si deseas cancelar el pedido.\n` +
    `✏️ Si necesitas corregir calle, numeración o agregar referencia, escríbela aquí.`
  );
}

export function validateOrderCompleteness(order) {
  const errors = [];
  const name = String(order.customer_name || '').trim();
  const phone = normalizeChilePhone(order.customer_phone);
  const address = String(order.customer_address || '').trim();
  const commune = String(order.customer_commune || '').trim();
  const region = String(order.customer_region || 'Región Metropolitana').trim();
  const sku = String(order.master_sku || '').trim();
  const total = Number(order.total_price || 0);

  if (!name || name.length < 2) errors.push('Nombre del cliente incompleto');
  if (!phone || phone.length < 10) errors.push('Teléfono inválido o incompleto');
  if (!address || address.length < 4) errors.push('Dirección de calle y numeración incompleta');
  if (!commune || commune.length < 2) errors.push('Comuna de despacho requerida');
  if (!region) errors.push('Región requerida');
  if (!sku) errors.push('SKU maestro requerido');
  if (!(total > 0)) errors.push('Total del pedido debe ser mayor a $0');

  return {
    valid: errors.length === 0,
    errors,
    normalized: { name, phone, address, commune, region, sku, total }
  };
}

export function parseWhatsAppReplyIntent(rawText = '') {
  const clean = String(rawText || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!clean) return 'ambiguous';

  // Reject patterns
  if (
    /^(no|2|cancelar|cancelo|rechazar|rechazo|anular|no quiero|no lo quiero|me equivoque|ya no)\b/.test(clean) ||
    clean === 'no' ||
    clean === 'cancelar'
  ) {
    return 'reject';
  }

  // Confirm patterns (without contradictory 'no' or address change caveats)
  const hasConfirmWord = /^(si|1|confirmo|confirmado|confirmar|ok|okay|dale|de acuerdo|correcto|si confirmo|acepto|todo bien|esta bien|envienlo|enviar)\b/.test(clean);
  const hasDoubtOrChange = /\b(pero|cambiar|cambio|otra direccion|equivocad|falta|cual|cuando|donde|precio|\?)\b/.test(clean);
  if (hasConfirmWord && !hasDoubtOrChange && clean.length <= 60) {
    return 'confirm';
  }

  return 'ambiguous';
}

/**
 * Endpoint 1: Track visitor ping / heartbeat
 */
export function trackVisit(db, input = {}, context = {}) {
  const rawId = input.landing_id || input.landingId || 'aerosleep';
  const landingId = sanitizeId(rawId);
  if (!landingId) fail(400, 'landing_id requerido');

  const visitorId = String(input.visitor_id || input.visitorId || randomUUID()).trim();
  const rawSessionId = String(input.session_id || input.sessionId || visitorId).trim();
  const sessionId = /^[A-Za-z0-9:_-]{8,128}$/.test(rawSessionId) ? rawSessionId : visitorId;
  const utmSource = input.utm_source ? String(input.utm_source).slice(0, 100) : null;
  const utmCampaign = input.utm_campaign ? String(input.utm_campaign).slice(0, 100) : null;
  const funnelEvent = ['checkout_opened', 'checkout_progress'].includes(input.funnel_event) ? input.funnel_event : '';
  const requestedStage = ['visit', 'checkout_opened', 'checkout_progress', 'purchase'].includes(input.funnel_stage) ? input.funnel_stage : 'visit';
  const city = String(context.city || '').trim().slice(0, 100) || null;
  const country = String(context.country || '').trim().slice(0, 80) || null;

  const today = getLocalDateString();
  const currentIso = now();

  ensureCampaignColumn(db);
  transaction(db, () => {
    let landing = db.prepare('SELECT id, campaign_active FROM landings WHERE id=?').get(landingId);
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

    // Solo registrar visitas y usuarios en vivo si la landing est? activa EN CAMPA?A
    if (!landing || !landing.campaign_active) {
      return;
    }
    const stageRank = { visit: 0, checkout_opened: 1, checkout_progress: 2, purchase: 3 };
    const existingVisit = db.prepare('SELECT id, stage FROM landing_visits WHERE landing_id=? AND date=? AND visitor_id=?').get(
      landingId,
      today,
      visitorId
    );

    if (existingVisit) {
      const hasAcceptedOrder = requestedStage === 'purchase' && db.prepare('SELECT 1 FROM landing_orders WHERE landing_id=? AND visitor_id=? LIMIT 1').get(landingId, visitorId);
      const nextStage = hasAcceptedOrder && stageRank.purchase > stageRank[existingVisit.stage || 'visit']
        ? 'purchase'
        : stageRank[requestedStage] > stageRank[existingVisit.stage || 'visit'] && requestedStage !== 'purchase'
          ? requestedStage
          : existingVisit.stage || 'visit';
      db.prepare('UPDATE landing_visits SET last_ping=?, stage=?, stage_updated_at=CASE WHEN stage<>? THEN ? ELSE stage_updated_at END WHERE id=?')
        .run(currentIso, nextStage, nextStage, currentIso, existingVisit.id);
    } else {
      db.prepare(`
        INSERT INTO landing_visits (id, landing_id, visitor_id, last_ping, date, utm_source, utm_campaign, stage, stage_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        landingId,
        visitorId,
        currentIso,
        today,
        utmSource,
        utmCampaign,
        requestedStage === 'purchase' ? 'visit' : requestedStage,
        currentIso
      );
    }
    const existingSession = db.prepare('SELECT stage FROM landing_sessions WHERE landing_id=? AND session_id=?').get(landingId, sessionId);
    const hasAcceptedSessionOrder = requestedStage === 'purchase' && db.prepare('SELECT 1 FROM landing_orders WHERE landing_id=? AND session_id=? LIMIT 1').get(landingId, sessionId);
    const currentSessionStage = existingSession?.stage || 'visit';
    const nextSessionStage = hasAcceptedSessionOrder
      ? 'purchase'
      : stageRank[requestedStage] > stageRank[currentSessionStage] && requestedStage !== 'purchase'
        ? requestedStage
        : currentSessionStage;
    if (existingSession) {
      if (city || country) {
        db.prepare(`UPDATE landing_activity_events SET city=COALESCE(NULLIF(city,''),?),
          country=COALESCE(NULLIF(country,''),?)
          WHERE landing_id=? AND session_id=? AND event_type='visit' AND (city IS NULL OR country IS NULL)`)
          .run(city, country, landingId, sessionId);
      }
      db.prepare('UPDATE landing_sessions SET last_ping=?, stage=?, stage_updated_at=CASE WHEN stage<>? THEN ? ELSE stage_updated_at END WHERE landing_id=? AND session_id=?')
        .run(currentIso, nextSessionStage, nextSessionStage, currentIso, landingId, sessionId);
      if (nextSessionStage !== currentSessionStage && ['checkout_opened', 'checkout_progress'].includes(nextSessionStage)) {
        db.prepare(`INSERT INTO landing_activity_events
          (id, landing_id, session_id, visitor_id, event_type, product_name, city, country, utm_source, utm_campaign, occurred_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), landingId, sessionId, visitorId, nextSessionStage, String(input.landing_name || landing.name || '').slice(0, 200), city, country, utmSource, utmCampaign, currentIso);
      }
    } else {
      db.prepare(`
        INSERT INTO landing_sessions (landing_id, session_id, visitor_id, date, started_at, last_ping, stage, stage_updated_at, utm_source, utm_campaign)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(landingId, sessionId, visitorId, today, currentIso, currentIso, requestedStage === 'purchase' ? 'visit' : requestedStage, currentIso, utmSource, utmCampaign);
      db.prepare(`INSERT INTO landing_activity_events
        (id, landing_id, session_id, visitor_id, event_type, product_name, city, country, utm_source, utm_campaign, occurred_at)
        VALUES (?, ?, ?, ?, 'visit', ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), landingId, sessionId, visitorId, String(input.landing_name || landing.name || '').slice(0, 200), city, country, utmSource, utmCampaign, currentIso);
    }
    if (funnelEvent) {
      db.prepare(`
        INSERT INTO landing_funnel_events (id, landing_id, visitor_id, event_type, event_date, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(landing_id, visitor_id, event_date, event_type) DO UPDATE SET occurred_at=excluded.occurred_at
      `).run(randomUUID(), landingId, visitorId, funnelEvent, today, currentIso);
    }
  });

  return { ok: true, landing_id: landingId, active: true };
}

/**
 * Endpoint 2: Receive Cash on Delivery (COD) order from independent landing
 * Con idempotencia/deduplicación y solicitud opcional de confirmación WhatsApp.
 */
export function receiveLandingOrder(db, input = {}, { whatsapp = null, context = {} } = {}) {
  ensureLandingOrderSchema(db);
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
  const visitorId = String(input.visitor_id || input.visitorId || '').trim().slice(0, 128);
  const rawSessionId = String(input.session_id || input.sessionId || '').trim();
  const sessionId = /^[A-Za-z0-9:_-]{8,128}$/.test(rawSessionId) ? rawSessionId : '';

  const utmSource = input.utm_source ? String(input.utm_source).slice(0, 100) : null;
  const utmCampaign = input.utm_campaign ? String(input.utm_campaign).slice(0, 100) : null;

  const normPhone = normalizeChilePhone(phone);
  const idempotencyKey = String(
    input.idempotency_key ||
    input.request_id ||
    `${landingId}:${normPhone}:${packSelected}:${totalPrice}`
  ).trim();

  const currentIso = now();
  const dedupWindowIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const result = transaction(db, () => {
    // 0. Deduplicación / Idempotencia: evitar doble clic en formulario de landing
    const recentDuplicate = db.prepare(`
      SELECT * FROM landing_orders
      WHERE idempotency_key = ? AND created_at >= ?
      ORDER BY created_at DESC LIMIT 1
    `).get(idempotencyKey, dedupWindowIso);

    if (recentDuplicate) {
      return {
        ok: true,
        deduplicated: true,
        order_id: recentDuplicate.order_id,
        landing_order_id: recentDuplicate.id,
        order_number: recentDuplicate.order_number,
        landing_id: recentDuplicate.landing_id,
        master_sku: recentDuplicate.master_sku,
        supplier_platform: recentDuplicate.supplier_platform,
        total_price: recentDuplicate.total_price,
        customer: recentDuplicate.customer_name,
        phone: recentDuplicate.customer_phone,
        status: recentDuplicate.status,
        created_at: recentDuplicate.created_at,
        message: 'Pedido ya registrado (idempotente)'
      };
    }

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

    const orderId = randomUUID();
    const landingOrderId = randomUUID();

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

    if (visitorId) {
      db.prepare('UPDATE landing_visits SET last_ping=?, stage=\'purchase\', stage_updated_at=? WHERE landing_id=? AND visitor_id=? AND date=?')
        .run(currentIso, currentIso, landingId, visitorId, getLocalDateString());
      db.prepare(`
        INSERT INTO landing_funnel_events (id, landing_id, visitor_id, event_type, event_date, occurred_at, order_id)
        VALUES (?, ?, ?, 'purchase', ?, ?, ?)
        ON CONFLICT(landing_id, visitor_id, event_date, event_type) DO UPDATE SET occurred_at=excluded.occurred_at, order_id=excluded.order_id
      `).run(randomUUID(), landingId, visitorId, getLocalDateString(), currentIso, orderId);
    }
    if (sessionId) {
      db.prepare('UPDATE landing_sessions SET last_ping=?, stage=\'purchase\', stage_updated_at=? WHERE landing_id=? AND session_id=?')
        .run(currentIso, currentIso, landingId, sessionId);
    }

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

    // 6. Record in landing_orders (inicia siempre como 'pending' hasta confirmar por WhatsApp)
    db.prepare(`
      INSERT INTO landing_orders (
        id, landing_id, order_id, order_number, product_name, pack_selected, total_price,
        customer_name, customer_phone, customer_address, customer_commune, customer_region,
        master_sku, supplier_platform, supplier_product_id, utm_source, utm_campaign, visitor_id, session_id,
        status, dropea_status, dropi_status, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      visitorId || null,
      sessionId || null,
      'pending',
      null,
      null,
      idempotencyKey,
      currentIso
    );

    const activitySessionId = sessionId || `order-${landingOrderId}`;
    db.prepare(`INSERT INTO landing_activity_events
      (id, landing_id, session_id, visitor_id, event_type, product_name, order_id, order_number, total_price, city, country, utm_source, utm_campaign, occurred_at)
      VALUES (?, ?, ?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), landingId, activitySessionId, visitorId || `order-${landingOrderId}`, productName, orderId, nextNumber, totalPrice,
        String(context.city || '').trim().slice(0, 100) || null,
        String(context.country || '').trim().slice(0, 80) || null,
        utmSource, utmCampaign, currentIso);

    return {
      ok: true,
      order_id: orderId,
      landing_order_id: landingOrderId,
      order_number: nextNumber,
      landing_id: landingId,
      master_sku: masterSku,
      supplier_platform: supplierPlatform,
      auto_fulfillment: String(landing?.auto_fulfillment || 'none').toLowerCase(),
      total_price: totalPrice,
      customer: fullName,
      phone,
      status: 'pending',
      created_at: currentIso,
      message: 'Pedido contra entrega registrado en Nexora (pendiente de confirmación WhatsApp)'
    };
  });

  // Si hay WhatsApp conectado en el servidor y no es duplicado, envía automáticamente el mensaje de confirmación
  if (!result.deduplicated && whatsapp) {
    try {
      const waStatus = whatsapp.status?.();
      if (waStatus?.connected) {
        setImmediate(() => {
          sendLandingOrderWhatsAppRequest(db, result.landing_order_id, { whatsapp }).catch(() => {});
        });
      }
    } catch {}
  }

  return result;
}

/**
 * Enviar solicitud de confirmación por WhatsApp (vía Baileys QR, Cloud API o enlace wa.me)
 */
export async function sendLandingOrderWhatsAppRequest(db, orderId, { whatsapp = null, customMessage = null, mode = 'auto' } = {}) {
  ensureLandingOrderSchema(db);
  const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
  if (!order) fail(404, 'Pedido no encontrado');

  const messageText = customMessage ? String(customMessage).trim() : buildWhatsAppConfirmationMessage(order);
  const normPhone = normalizeChilePhone(order.customer_phone);
  if (!normPhone || normPhone.length < 10) {
    fail(400, 'El pedido no tiene un teléfono válido para enviar WhatsApp');
  }

  const waMeUrl = `https://wa.me/${normPhone}?text=${encodeURIComponent(messageText)}`;
  let sendResult = { ok: false, channel: 'wa_me', remote_id: null };

  if (mode !== 'wa_me' && whatsapp?.sendText) {
    try {
      sendResult = await whatsapp.sendText(normPhone, messageText);
    } catch (err) {
      sendResult = { ok: false, channel: 'wa_me', error: err.message };
    }
  }

  const nextStatus = ['confirmed', 'sent_to_supplier', 'shipped', 'delivered'].includes(order.status)
    ? order.status
    : 'awaiting_confirmation';

  transaction(db, () => {
    db.prepare(`
      UPDATE landing_orders
      SET status = ?, confirmation_sent_at = ?
      WHERE id = ?
    `).run(nextStatus, now(), order.id);

    logWhatsAppConfirmationEvent(db, {
      landing_order_id: order.id,
      order_number: order.order_number,
      phone: normPhone,
      direction: 'outbound',
      channel: sendResult.ok ? sendResult.channel : 'wa_me',
      message_text: messageText,
      parsed_intent: 'request_confirmation',
      status_before: order.status,
      status_after: nextStatus,
      remote_message_id: sendResult.remote_id || null
    });
  });

  return {
    ok: true,
    sent_automatically: Boolean(sendResult.ok),
    channel: sendResult.ok ? sendResult.channel : 'wa_me',
    order_id: order.id,
    order_number: order.order_number,
    status: nextStatus,
    phone: normPhone,
    wa_me_url: waMeUrl,
    message: sendResult.ok
      ? `Solicitud de confirmación enviada automáticamente por WhatsApp (${sendResult.channel}) a +${normPhone}`
      : 'Pedido marcado en espera de confirmación. Se preparó el enlace manual de WhatsApp.'
  };
}

/**
 * Procesar respuesta entrante de WhatsApp (desde Baileys QR, Webhook Cloud API o simulador/operador)
 */
export async function processIncomingWhatsAppConfirmation(db, { phone, text: replyText, remoteId = null, channel = 'webhook', orderId = null } = {}) {
  ensureLandingOrderSchema(db);
  const normPhone = normalizeChilePhone(phone);
  const last8 = normPhone.slice(-8);
  const eventId = remoteId || `wa-evt-${normPhone}-${Date.now()}`;

  // 1. Deduplicar evento
  const existingEvt = db.prepare('SELECT event_id FROM whatsapp_webhook_events WHERE event_id=?').get(eventId);
  if (existingEvt) {
    return { ok: true, deduplicated: true, event_id: eventId };
  }

  // 2. Buscar el pedido correspondiente
  let order = null;
  if (orderId) {
    order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
  }
  if (!order && last8.length >= 8) {
    order = db.prepare(`
      SELECT * FROM landing_orders
      WHERE REPLACE(REPLACE(REPLACE(customer_phone, '+', ''), ' ', ''), '-', '') LIKE ?
        AND status IN ('awaiting_confirmation', 'pending', 'needs_review')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(`%${last8}%`);
  }

  if (!order) {
    return { ok: false, matched: false, message: 'No se encontró un pedido pendiente para ese número de teléfono' };
  }

  const intent = parseWhatsAppReplyIntent(replyText);
  const completeness = validateOrderCompleteness(order);
  const stamp = now();

  let nextStatus = order.status;
  if (intent === 'confirm') {
    nextStatus = completeness.valid ? 'confirmed' : 'needs_review';
  } else if (intent === 'reject') {
    nextStatus = 'cancelled';
  } else {
    nextStatus = 'needs_review';
  }

  transaction(db, () => {
    db.prepare(`
      INSERT OR IGNORE INTO whatsapp_webhook_events (event_id, channel, phone, payload_json, processed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, channel, normPhone, JSON.stringify({ phone: normPhone, text: replyText, intent }), stamp);

    if (nextStatus === 'confirmed') {
      db.prepare(`
        UPDATE landing_orders
        SET status = 'confirmed',
            confirmed_at = ?,
            confirmation_source = ?,
            confirmation_reply = ?
        WHERE id = ?
      `).run(stamp, channel, String(replyText || '').slice(0, 500), order.id);
    } else {
      db.prepare(`
        UPDATE landing_orders
        SET status = ?,
            confirmation_source = ?,
            confirmation_reply = ?
        WHERE id = ?
      `).run(nextStatus, channel, String(replyText || '').slice(0, 500), order.id);

      if (nextStatus === 'cancelled' && order.order_id) {
        db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(order.order_id);
      }
    }

    logWhatsAppConfirmationEvent(db, {
      landing_order_id: order.id,
      order_number: order.order_number,
      phone: normPhone,
      direction: 'inbound',
      channel,
      message_text: String(replyText || '').slice(0, 500),
      parsed_intent: intent,
      status_before: order.status,
      status_after: nextStatus,
      remote_message_id: eventId
    });
  });

  // 3. Si el cliente confirmó ("Sí") y los datos son válidos, verificar si la landing tiene auto_fulfillment en Dropi
  let autoDispatchResult = null;
  if (nextStatus === 'confirmed') {
    const landing = db.prepare('SELECT * FROM landings WHERE id=?').get(order.landing_id);
    const autoFulfillment = String(landing?.auto_fulfillment || 'none').toLowerCase();
    if (autoFulfillment === 'dropi') {
      try {
        autoDispatchResult = await sendOrderToSupplier(db, order.id, { platform: 'Dropi' });
      } catch (err) {
        autoDispatchResult = { ok: false, error: err.message };
      }
    }
  }

  return {
    ok: true,
    matched: true,
    order_id: order.id,
    order_number: order.order_number,
    intent,
    completeness_valid: completeness.valid,
    completeness_errors: completeness.errors,
    status_before: order.status,
    status_after: autoDispatchResult?.ok ? 'sent_to_supplier' : nextStatus,
    auto_dispatch: autoDispatchResult
  };
}

/**
 * Webhook oficial de WhatsApp Cloud API (GET verificación y POST recepción firmada)
 */
export function verifyWhatsAppCloudWebhook(query = {}) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && expected && token === expected) {
    return { ok: true, challenge: String(challenge || '') };
  }
  fail(403, 'Token de verificación de webhook de WhatsApp inválido');
}

export async function receiveWhatsAppCloudWebhook(db, rawBodyBuffer, headers = {}) {
  const appSecret = process.env.WHATSAPP_APP_SECRET || '';
  if (appSecret) {
    const sigHeader = String(headers['x-hub-signature-256'] || '');
    const expectedSig = 'sha256=' + createHmac('sha256', appSecret).update(rawBodyBuffer).digest('hex');
    const a = Buffer.from(sigHeader);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      fail(401, 'Firma X-Hub-Signature-256 inválida');
    }
  }

  let payload = {};
  try {
    payload = JSON.parse(rawBodyBuffer.toString('utf8') || '{}');
  } catch {
    fail(400, 'JSON de webhook inválido');
  }

  const processed = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change?.value?.messages || [];
      for (const msg of messages) {
        const from = msg.from || '';
        const msgId = msg.id || randomUUID();
        const textBody = (
          msg.text?.body ||
          msg.button?.text ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          ''
        ).trim();
        if (from && textBody) {
          const res = await processIncomingWhatsAppConfirmation(db, {
            phone: from,
            text: textBody,
            remoteId: msgId,
            channel: 'cloud_api'
          });
          processed.push(res);
        }
      }
    }
  }

  return { ok: true, processed_count: processed.length, results: processed };
}

export function getLandingOrderAuditLogs(db, orderId) {
  ensureLandingOrderSchema(db);
  const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
  if (!order) fail(404, 'Pedido no encontrado');
  const logs = db.prepare('SELECT * FROM whatsapp_confirmation_logs WHERE landing_order_id=? ORDER BY created_at DESC LIMIT 50').all(order.id);
  return { order_id: order.id, order_number: order.order_number, logs };
}

/**
 * 3. Métricas para la vista de tarjetas de Landings (con soporte de filtro por fechas: Hoy, 7d, Mes, Todo, Desde/Hasta)
 */
function ensureCampaignColumn(db) {
  try {
    const cols = db.prepare("PRAGMA table_info('landings')").all().map(c => c.name);
    if (!cols.includes('campaign_active')) {
      db.prepare('ALTER TABLE landings ADD COLUMN campaign_active INTEGER NOT NULL DEFAULT 0').run();
      db.prepare("UPDATE landings SET campaign_active = 1 WHERE id = 'pelota-saltarina'").run();
    }
  } catch {}
}

export function getLandingsMetrics(db, query = {}) {
  ensureCampaignColumn(db);
  ensureLandingOrderSchema(db);
  const activeThreshold = new Date(Date.now() - 45 * 1000).toISOString();
  const range = resolveDateRange(query);
  const { period, from, to, today, utcToday } = range;

  const allLandings = db.prepare('SELECT * FROM landings ORDER BY created_at DESC').all();

  const list = allLandings.map(landing => {
    const activeRow = landing.campaign_active ? db.prepare(`
      SELECT COUNT(DISTINCT session_id) as c
      FROM landing_sessions
      WHERE landing_id=? AND last_ping >= ?
    `).get(landing.id, activeThreshold) : { c: 0 };
    const activeNow = activeRow?.c || 0;
    const activeVisitorRow = landing.campaign_active ? db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as c
      FROM landing_visits
      WHERE landing_id=? AND last_ping >= ?
    `).get(landing.id, activeThreshold) : { c: 0 };
    const activeVisitors = activeVisitorRow?.c || 0;

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

    let sessionsPeriod = 0;
    if (period === 'all') {
      sessionsPeriod = db.prepare('SELECT COUNT(*) AS c FROM landing_sessions WHERE landing_id=?').get(landing.id)?.c || 0;
    } else if (period === 'today') {
      sessionsPeriod = db.prepare('SELECT COUNT(*) AS c FROM landing_sessions WHERE landing_id=? AND date IN (?, ?)').get(landing.id, today, utcToday)?.c || 0;
    } else {
      sessionsPeriod = db.prepare('SELECT COUNT(*) AS c FROM landing_sessions WHERE landing_id=? AND date>=? AND date<=?').get(landing.id, from, to)?.c || 0;
    }

    let ordersPeriod = 0;
    let revenuePeriod = 0;
    let recentOrders = [];
    const sessionDateSql = period === 'all' ? '' : period === 'today' ? ' AND date IN (?, ?)' : ' AND date>=? AND date<=?';
    const sessionDateParams = period === 'all' ? [landing.id] : period === 'today' ? [landing.id, today, utcToday] : [landing.id, from, to];
    const checkoutOpenedPeriod = db.prepare(`
      SELECT COUNT(*) AS c FROM landing_sessions
      WHERE landing_id=? AND stage IN ('checkout_opened','checkout_progress','purchase')${sessionDateSql}
    `).get(...sessionDateParams)?.c || 0;
    const checkoutProgressPeriod = db.prepare(`
      SELECT COUNT(*) AS c FROM landing_sessions
      WHERE landing_id=? AND stage IN ('checkout_progress','purchase')${sessionDateSql}
    `).get(...sessionDateParams)?.c || 0;

    const liveStages = landing.campaign_active ? db.prepare(`
      SELECT stage, COUNT(DISTINCT session_id) AS c
      FROM landing_sessions WHERE landing_id=? AND last_ping>=? AND date IN (?, ?)
      GROUP BY stage
    `).all(landing.id, activeThreshold, today, utcToday) : [];
    const funnelLive = { visitors: activeNow, visit: 0, checkout_opened: 0, checkout_progress: 0, purchase: 0 };
    for (const row of liveStages) {
      if (row.stage === 'visit') funnelLive.visit = row.c || 0;
      if (row.stage === 'checkout_opened') funnelLive.checkout_opened = row.c || 0;
      if (row.stage === 'checkout_progress') funnelLive.checkout_progress = row.c || 0;
      if (row.stage === 'purchase') funnelLive.purchase = row.c || 0;
    }

    if (period === 'all') {
      const ordersRow = db.prepare(`
        SELECT COUNT(*) as c, COALESCE(SUM(total_price), 0) as rev 
        FROM landing_orders 
        WHERE landing_id=?
      `).get(landing.id);
      ordersPeriod = ordersRow?.c || 0;
      revenuePeriod = ordersRow?.rev || 0;

      recentOrders = db.prepare(`
        SELECT id, order_number, product_name, pack_selected, total_price, customer_name, customer_phone, customer_address, customer_commune, customer_region, master_sku, supplier_platform, status, confirmed_at, confirmation_reply, created_at 
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
        SELECT id, order_number, product_name, pack_selected, total_price, customer_name, customer_phone, customer_address, customer_commune, customer_region, master_sku, supplier_platform, status, confirmed_at, confirmation_reply, created_at 
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
        SELECT id, order_number, product_name, pack_selected, total_price, customer_name, customer_phone, customer_address, customer_commune, customer_region, master_sku, supplier_platform, status, confirmed_at, confirmation_reply, created_at 
        FROM landing_orders 
        WHERE landing_id=? AND (date(created_at, '-3 hours') BETWEEN ? AND ? OR substr(created_at, 1, 10) BETWEEN ? AND ?)
        ORDER BY created_at DESC 
        LIMIT 50
      `).all(landing.id, from, to, from, to);
    }

    const ordersTotalRow = db.prepare(`
      SELECT COUNT(*) as c, COALESCE(SUM(total_price), 0) as rev 
      FROM landing_orders 
      WHERE landing_id=?
    `).get(landing.id);
    const ordersTotal = ordersTotalRow?.c || 0;
    const revenueTotal = ordersTotalRow?.rev || 0;

    const conversionRate = sessionsPeriod > 0 ? Number(((ordersPeriod / sessionsPeriod) * 100).toFixed(1)) : 0;

    return {
      id: landing.id,
      name: landing.name,
      url: landing.url,
      master_sku: landing.master_sku || `SKU-${landing.id.toUpperCase()}-01`,
      supplier_platform: landing.supplier_platform || 'Dropea',
      supplier_product_id: landing.supplier_product_id || '',
      auto_fulfillment: landing.auto_fulfillment || 'none',
      campaign_active: Boolean(landing.campaign_active),
      created_at: landing.created_at,
      active_now: activeNow,
      active_visitors: activeVisitors,
      visits_today: sessionsPeriod,
      sessions_today: sessionsPeriod,
      unique_visitors_today: visitsPeriod,
      orders_today: ordersPeriod,
      funnel: { visits: sessionsPeriod, sessions: sessionsPeriod, unique_visitors: visitsPeriod, checkout_opened: checkoutOpenedPeriod, checkout_progress: checkoutProgressPeriod, orders: ordersPeriod },
      funnel_live: funnelLive,
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
    total_sessions_today: list.reduce((sum, l) => sum + l.sessions_today, 0),
    total_unique_visitors: list.reduce((sum, l) => sum + l.unique_visitors_today, 0),
    total_active_visitors: list.reduce((sum, l) => sum + l.active_visitors, 0),
    total_orders_today: list.reduce((sum, l) => sum + l.orders_today, 0),
    total_revenue_today: list.reduce((sum, l) => sum + l.revenue_today, 0),
    total_landings: list.length
  };

  return { landings: list, totals, filter: { period, from, to } };
}

/** Datos agregados para la vista Live / Compras de Nexora. */
export function getLandingLiveDashboard(db, query = {}) {
  const metrics = getLandingsMetrics(db, query);
  const activeMetrics = metrics.landings.filter(landing => landing.campaign_active);
  const { period, from, to, today, utcToday } = resolveDateRange(query);
  const activityRange = period === 'all' ? { sql: '', args: [] }
    : period === 'today' ? { sql: " AND (date(e.occurred_at,'-3 hours')=? OR substr(e.occurred_at,1,10) IN (?,?))", args: [today, today, utcToday] }
      : { sql: " AND (date(e.occurred_at,'-3 hours') BETWEEN ? AND ? OR substr(e.occurred_at,1,10) BETWEEN ? AND ?)", args: [from, to, from, to] };
  const liveSince = new Date(Date.now() - 45 * 1000).toISOString();
  const recentOrderSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const landings = activeMetrics.map(landing => {
    const locations = db.prepare(`SELECT NULLIF(e.city,'') AS city, NULLIF(e.country,'') AS country,
        COUNT(DISTINCT e.session_id) AS sessions FROM landing_activity_events e
      WHERE e.landing_id=? AND e.event_type='visit' AND (e.city IS NOT NULL OR e.country IS NOT NULL)${activityRange.sql}
      GROUP BY city,country ORDER BY sessions DESC LIMIT 5`).all(landing.id, ...activityRange.args);
    const firstTime = period === 'all'
      ? db.prepare(`SELECT COUNT(DISTINCT s.visitor_id) AS c FROM landing_sessions s WHERE s.landing_id=? AND NOT EXISTS
          (SELECT 1 FROM landing_sessions p WHERE p.landing_id=s.landing_id AND p.visitor_id=s.visitor_id AND p.date<s.date)`).get(landing.id)?.c || 0
      : period === 'today'
        ? db.prepare(`SELECT COUNT(DISTINCT s.visitor_id) AS c FROM landing_sessions s WHERE s.landing_id=? AND s.date IN (?,?) AND NOT EXISTS
            (SELECT 1 FROM landing_sessions p WHERE p.landing_id=s.landing_id AND p.visitor_id=s.visitor_id AND p.date<s.date)`).get(landing.id, today, utcToday)?.c || 0
        : db.prepare(`SELECT COUNT(DISTINCT s.visitor_id) AS c FROM landing_sessions s WHERE s.landing_id=? AND s.date BETWEEN ? AND ? AND NOT EXISTS
            (SELECT 1 FROM landing_sessions p WHERE p.landing_id=s.landing_id AND p.visitor_id=s.visitor_id AND p.date<s.date)`).get(landing.id, from, to)?.c || 0;
    const productRange = period === 'all' ? { sql: '', args: [] }
      : period === 'today' ? { sql: " AND (date(o.created_at,'-3 hours')=? OR substr(o.created_at,1,10) IN (?,?))", args: [today, today, utcToday] }
        : { sql: " AND (date(o.created_at,'-3 hours') BETWEEN ? AND ? OR substr(o.created_at,1,10) BETWEEN ? AND ?)", args: [from, to, from, to] };
    const topProducts = db.prepare(`SELECT o.product_name AS name, COUNT(*) AS orders, COALESCE(SUM(o.total_price),0) AS revenue
      FROM landing_orders o WHERE o.landing_id=? AND o.product_name<>''${productRange.sql}
      GROUP BY o.product_name ORDER BY orders DESC, revenue DESC LIMIT 5`).all(landing.id, ...productRange.args);
    const orderCustomers = db.prepare(`SELECT COUNT(DISTINCT o.customer_phone) AS total,
      COUNT(DISTINCT CASE WHEN NOT EXISTS (SELECT 1 FROM landing_orders p
        WHERE p.landing_id=o.landing_id AND p.customer_phone=o.customer_phone AND p.created_at<o.created_at)
        THEN o.customer_phone END) AS new_customers
      FROM landing_orders o WHERE o.landing_id=? AND TRIM(COALESCE(o.customer_phone,''))<>''${productRange.sql}`)
      .get(landing.id, ...productRange.args);

    const multiSessionVisitors = db.prepare(`SELECT COUNT(*) as c FROM (
      SELECT s.visitor_id FROM landing_sessions s
      WHERE s.landing_id=?
      GROUP BY s.visitor_id HAVING COUNT(*) > 1
    )`).get(landing.id)?.c || 0;
    const totalVisitors = Number(landing.unique_visitors_today || 0);
    const recurringVisitors = Math.min(totalVisitors, multiSessionVisitors);
    const newVisitors = Math.max(0, totalVisitors - recurringVisitors);

    const customers = (orderCustomers?.total > 0)
      ? { total: orderCustomers.total, new_customers: orderCustomers.new_customers, recurring_customers: Math.max(0, orderCustomers.total - orderCustomers.new_customers), type: 'orders' }
      : { total: totalVisitors, new_customers: newVisitors, recurring_customers: recurringVisitors, type: 'visitors' };
    const behaviorRows = db.prepare(`SELECT stage,COUNT(DISTINCT session_id) AS c FROM landing_sessions
      WHERE landing_id=? AND last_ping>=? GROUP BY stage`).all(landing.id, liveSince);
    const recentOrderCount = db.prepare(`SELECT COUNT(*) AS c FROM landing_orders WHERE landing_id=? AND created_at>=?`).get(landing.id, recentOrderSince)?.c || 0;
    const behavior = { active_carts: 0, checking_out: 0, purchased: recentOrderCount };
    for (const row of behaviorRows) {
      if (row.stage === 'visit') behavior.active_carts = row.c || 0;
      if (row.stage === 'checkout_opened' || row.stage === 'checkout_progress') behavior.checking_out += row.c || 0;
      if (row.stage === 'purchase' && row.c > behavior.purchased) behavior.purchased = row.c;
    }
    const productImage = db.prepare(`SELECT p.image_url FROM products p JOIN variants v ON v.product_id=p.id
      WHERE v.meibo_sku=? AND p.image_url<>'' LIMIT 1`).get(landing.master_sku || '')?.image_url || '';
    return { ...landing, product_image: productImage, first_time_visitors: firstTime, customers, locations, top_products: topProducts, behavior };
  });
  const activeIds = activeMetrics.map(landing => landing.id);
  const activity = activeIds.length ? db.prepare(`SELECT e.id,e.landing_id,l.name AS landing_name,l.url AS landing_url,e.event_type,
      e.product_name,e.order_id,e.order_number,e.total_price,e.city,e.country,e.utm_source,e.utm_campaign,e.occurred_at
    FROM landing_activity_events e JOIN landings l ON l.id=e.landing_id WHERE e.landing_id IN (${activeIds.map(() => '?').join(',')})${activityRange.sql}
    ORDER BY e.occurred_at DESC LIMIT 100`).all(...activeIds, ...activityRange.args) : [];
  const totals = {
    total_active_now: activeMetrics.reduce((sum, l) => sum + l.active_now, 0),
    total_sessions_today: activeMetrics.reduce((sum, l) => sum + l.sessions_today, 0),
    total_unique_visitors: activeMetrics.reduce((sum, l) => sum + l.unique_visitors_today, 0),
    total_orders_today: activeMetrics.reduce((sum, l) => sum + l.orders_today, 0),
    total_revenue_today: activeMetrics.reduce((sum, l) => sum + l.revenue_today, 0),
    total_landings: activeMetrics.length
  };
  return { landings, activity, totals: { ...totals, total_sessions: totals.total_sessions_today,
    visitors: totals.total_unique_visitors, conversion_rate: totals.total_sessions_today
      ? Number(((totals.total_orders_today / totals.total_sessions_today) * 100).toFixed(2)) : 0 },
    filter: metrics.filter, refreshed_at: now() };
}

/**
 * 4. Obtener TODOS los pedidos COD de Landings con filtros
 */
export function getAllLandingOrders(db, query = {}) {
  ensureLandingOrderSchema(db);
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
  const landings = db.prepare('SELECT id, name, master_sku, supplier_platform FROM landings ORDER BY name ASC').all();

  return {
    orders,
    total,
    count: orders.length,
    landings
  };
}

/**
 * 5. Actualizar estado de un pedido COD con registro de auditoría
 */
export function updateLandingOrderStatus(db, orderId, input = {}) {
  ensureLandingOrderSchema(db);
  const status = text(input.status, 'Estado', 50, true);
  const guideNumber = input.guide_number ? String(input.guide_number).trim() : null;
  const trackingUrl = input.tracking_url ? String(input.tracking_url).trim() : null;
  const note = input.note ? String(input.note).trim() : null;

  if (!VALID_LANDING_STATUSES.includes(status)) {
    fail(400, `Estado inválido. Opciones: ${VALID_LANDING_STATUSES.join(', ')}`);
  }

  return transaction(db, () => {
    const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
    if (!order) fail(404, 'Pedido no encontrado');

    const stamp = now();
    const isConfirming = status === 'confirmed' && !order.confirmed_at;

    db.prepare(`
      UPDATE landing_orders 
      SET status=?,
          guide_number=COALESCE(?, guide_number),
          tracking_url=COALESCE(?, tracking_url),
          confirmed_at=CASE WHEN ? THEN ? ELSE confirmed_at END,
          confirmation_source=CASE WHEN ? THEN COALESCE(confirmation_source, 'manual') ELSE confirmation_source END,
          confirmation_reply=COALESCE(?, confirmation_reply),
          dispatch_error=CASE WHEN ?='confirmed' THEN NULL ELSE dispatch_error END
      WHERE id=?
    `).run(
      status,
      guideNumber,
      trackingUrl,
      isConfirming ? 1 : 0,
      stamp,
      isConfirming ? 1 : 0,
      note,
      status,
      order.id
    );

    logWhatsAppConfirmationEvent(db, {
      landing_order_id: order.id,
      order_number: order.order_number,
      phone: normalizeChilePhone(order.customer_phone),
      direction: 'operator',
      channel: 'manual',
      message_text: note || `Cambio manual de estado a ${status}`,
      parsed_intent: status,
      status_before: order.status,
      status_after: status
    });

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
 * 5.1 Modificar todos los detalles de un pedido COD
 */
export function updateLandingOrderDetails(db, orderId, input = {}) {
  ensureLandingOrderSchema(db);
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
    const status = input.status && VALID_LANDING_STATUSES.includes(String(input.status).trim()) ? String(input.status).trim() : order.status;
    const guideNumber = input.guide_number !== undefined ? String(input.guide_number).trim() : order.guide_number;

    const isConfirming = status === 'confirmed' && !order.confirmed_at;

    db.prepare(`
      UPDATE landing_orders 
      SET customer_name=?, customer_phone=?, customer_address=?, customer_commune=?, customer_region=?,
          pack_selected=?, total_price=?, master_sku=?, supplier_platform=?, supplier_product_id=?,
          status=?, guide_number=?,
          confirmed_at=CASE WHEN ? THEN ? ELSE confirmed_at END,
          confirmation_source=CASE WHEN ? THEN COALESCE(confirmation_source, 'manual') ELSE confirmation_source END
      WHERE id=?
    `).run(
      customerName, customerPhone, customerAddress, customerCommune, customerRegion,
      packSelected, totalPrice, masterSku, supplierPlatform, supplierProductId,
      status, guideNumber,
      isConfirming ? 1 : 0, now(),
      isConfirming ? 1 : 0,
      order.id
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
        SET customer_name=?, status=? 
        WHERE id=?
      `).run(`${customerName} (${customerPhone} · ${customerCommune})`, nexoraStatus, order.order_id);
    }

    return {
      ok: true,
      message: 'Pedido actualizado correctamente',
      order: db.prepare('SELECT * FROM landing_orders WHERE id=?').get(order.id)
    };
  });
}

/**
 * 5.2 Eliminar un pedido COD individual (limpia landing_orders, orders, order_items, packing_events y logs)
 */
export function deleteLandingOrder(db, orderId) {
  ensureLandingOrderSchema(db);
  return transaction(db, () => {
    const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
    if (!order) fail(404, 'Pedido no encontrado');

    db.prepare('DELETE FROM whatsapp_confirmation_logs WHERE landing_order_id=?').run(order.id);
    db.prepare('DELETE FROM landing_orders WHERE id=?').run(order.id);

    if (order.order_id) {
      try { db.prepare('DELETE FROM packing_events WHERE order_id=?').run(order.order_id); } catch {}
      try { db.prepare('DELETE FROM order_items WHERE order_id=?').run(order.order_id); } catch {}
      try { db.prepare('DELETE FROM landing_order_requests WHERE order_id=?').run(order.order_id); } catch {}
      try { db.prepare('DELETE FROM external_order_details WHERE order_id=?').run(order.order_id); } catch {}
      try { db.prepare('DELETE FROM packing_support_requests WHERE order_id=?').run(order.order_id); } catch {}
      try { db.prepare('DELETE FROM orders WHERE id=?').run(order.order_id); } catch {}
    }

    return {
      ok: true,
      deleted_id: order.id,
      order_number: order.order_number,
      message: `Pedido #${order.order_number} eliminado correctamente`
    };
  });
}

/**
 * 5.3 Limpiar pedidos de prueba o seleccionados en bloque
 */
export function cleanupTestLandingOrders(db, input = {}) {
  ensureLandingOrderSchema(db);
  return transaction(db, () => {
    let targetOrders = [];
    if (Array.isArray(input.ids) && input.ids.length > 0) {
      const placeholders = input.ids.map(() => '?').join(',');
      targetOrders = db.prepare(`SELECT * FROM landing_orders WHERE id IN (${placeholders})`).all(...input.ids);
    } else if (input.all === true) {
      targetOrders = db.prepare("SELECT * FROM landing_orders WHERE status != 'sent_to_supplier' AND status != 'delivered'").all();
    } else {
      targetOrders = db.prepare(`
        SELECT * FROM landing_orders
        WHERE LOWER(customer_name) LIKE '%test%'
           OR LOWER(customer_name) LIKE '%prueba%'
           OR LOWER(product_name) LIKE '%prueba%'
           OR customer_phone LIKE '%12345678%'
           OR customer_phone LIKE '%000000%'
           OR status = 'cancelled'
      `).all();
    }

    let deletedCount = 0;
    for (const order of targetOrders) {
      db.prepare('DELETE FROM whatsapp_confirmation_logs WHERE landing_order_id=?').run(order.id);
      db.prepare('DELETE FROM landing_orders WHERE id=?').run(order.id);
      if (order.order_id) {
        try { db.prepare('DELETE FROM packing_events WHERE order_id=?').run(order.order_id); } catch {}
        try { db.prepare('DELETE FROM order_items WHERE order_id=?').run(order.order_id); } catch {}
        try { db.prepare('DELETE FROM landing_order_requests WHERE order_id=?').run(order.order_id); } catch {}
        try { db.prepare('DELETE FROM external_order_details WHERE order_id=?').run(order.order_id); } catch {}
        try { db.prepare('DELETE FROM packing_support_requests WHERE order_id=?').run(order.order_id); } catch {}
        try { db.prepare('DELETE FROM orders WHERE id=?').run(order.order_id); } catch {}
      }
      deletedCount++;
    }

    return {
      ok: true,
      deleted_count: deletedCount,
      message: deletedCount > 0
        ? `Se eliminaron ${deletedCount} pedido(s) de prueba o cancelados`
        : 'No se encontraron pedidos de prueba para eliminar'
    };
  });
}

/**
 * 6. Enviar orden a proveedor mayorista (Dropi Chile vía Dropi MCP oficial o Bodega Propia)
 * Incluye guarda obligatoria status === 'confirmed', validación de datos, idempotencia y CERO guías ficticias.
 */
export async function sendOrderToSupplier(db, orderId, options = {}) {
  ensureLandingOrderSchema(db);
  const order = db.prepare('SELECT * FROM landing_orders WHERE id=? OR order_id=?').get(orderId, orderId);
  if (!order) fail(404, 'Pedido no encontrado');

  // 1. Idempotencia: si ya fue enviado exitosamente al proveedor, devolver el registro existente sin duplicar
  if (order.status === 'sent_to_supplier' && order.supplier_order_id) {
    return {
      ok: true,
      idempotent: true,
      message: `El pedido #${order.order_number} ya fue enviado previamente (${order.supplier_order_id})`,
      order_id: order.id,
      supplier_platform: order.supplier_platform,
      supplier_order_id: order.supplier_order_id,
      guide_number: order.guide_number || '',
      tracking_url: order.tracking_url || '',
      status: 'sent_to_supplier'
    };
  }

  // 2. Guarda obligatoria: rechazar pedidos cancelados o sin confirmar
  if (order.status === 'cancelled') {
    fail(409, `El pedido #${order.order_number} está cancelado y no puede despacharse.`);
  }

  if (options.auto_confirm === true && order.status !== 'confirmed' && order.status !== 'paid') {
    const stamp = now();
    db.prepare(`
      UPDATE landing_orders
      SET status='confirmed',
          confirmed_at=COALESCE(confirmed_at, ?),
          confirmation_source=COALESCE(confirmation_source, 'manual_operator')
      WHERE id=?
    `).run(stamp, order.id);
    order.status = 'confirmed';
    order.confirmed_at = order.confirmed_at || stamp;
  }

  if (order.status !== 'confirmed' && order.status !== 'paid') {
    fail(
      409,
      `El pedido #${order.order_number} debe estar confirmado por WhatsApp (estado "Confirmado WhatsApp") antes de enviarse al proveedor. Estado actual: ${order.status}.`
    );
  }

  // 3. Validar datos completos y coherentes del pedido antes de despachar
  const check = validateOrderCompleteness(order);
  if (!check.valid) {
    db.prepare("UPDATE landing_orders SET status='needs_review', dispatch_error=? WHERE id=?").run(
      check.errors.join('. '),
      order.id
    );
    fail(400, `Datos incompletos para despachar pedido #${order.order_number}: ${check.errors.join(', ')}`);
  }

  const landing = order.landing_id
    ? db.prepare('SELECT * FROM landings WHERE id=?').get(order.landing_id)
    : null;

  const platform = String(options.platform || order.supplier_platform || landing?.supplier_platform || 'Dropi').trim();
  const isDropi = platform.toLowerCase().includes('dropi');
  const isLocal = ['propio', 'local', 'nexora', 'bodega'].some(k => platform.toLowerCase().includes(k));

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

  // 4. Adaptador Real: Dropi Chile vía Dropi MCP
  if (isDropi) {
    if (!resolvedProductId) {
      db.prepare("UPDATE landing_orders SET status='supplier_error', dispatch_error=? WHERE id=?").run(
        'Falta ID de producto de Dropi en el mapeo de la landing o SKU Maestro.',
        order.id
      );
      fail(400, `El pedido #${order.order_number} no tiene un ID de producto de Dropi asociado. Configúralo en Mapeo.`);
    }

    try {
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

      if (!mcpResult?.dropi_order_id) {
        throw new Error('Dropi no devolvió un ID de orden confirmado.');
      }

      const supplierOrderId = `DROPI-${mcpResult.dropi_order_id}`;
      const guideNumber = mcpResult.tracking_code || '';
      const trackingUrl = `https://app.dropi.cl/dashboard/orders/details/${mcpResult.dropi_order_id}`;

      return transaction(db, () => {
        db.prepare(`
          UPDATE landing_orders 
          SET status='sent_to_supplier',
              supplier_platform='Dropi',
              supplier_product_id=?,
              supplier_order_id=?,
              guide_number=?,
              tracking_url=?,
              dropi_status=?,
              dispatch_error=NULL
          WHERE id=?
        `).run(resolvedProductId, supplierOrderId, guideNumber, trackingUrl, mcpResult.status || 'PENDIENTE', order.id);

        if (order.order_id) {
          db.prepare("UPDATE orders SET status='packed' WHERE id=?").run(order.order_id);
        }

        logWhatsAppConfirmationEvent(db, {
          landing_order_id: order.id,
          order_number: order.order_number,
          phone: check.normalized.phone,
          direction: 'operator',
          channel: 'dropi_mcp',
          message_text: `Despachado a Dropi Chile (${supplierOrderId})`,
          parsed_intent: 'sent_to_supplier',
          status_before: order.status,
          status_after: 'sent_to_supplier',
          remote_message_id: String(mcpResult.dropi_order_id)
        });

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
    } catch (err) {
      const errMsg = err?.message || 'Error al crear orden en Dropi MCP';
      transaction(db, () => {
        db.prepare("UPDATE landing_orders SET status='supplier_error', dispatch_error=? WHERE id=?").run(errMsg, order.id);
        logWhatsAppConfirmationEvent(db, {
          landing_order_id: order.id,
          order_number: order.order_number,
          phone: check.normalized.phone,
          direction: 'operator',
          channel: 'dropi_mcp',
          message_text: `Error en despacho Dropi: ${errMsg}`,
          parsed_intent: 'supplier_error',
          status_before: order.status,
          status_after: 'supplier_error'
        });
      });
      fail(502, `Dropi rechazó o no pudo crear el pedido #${order.order_number}: ${errMsg}`);
    }
  }

  // 5. Adaptador Real: Bodega Propia / Empaque Local Nexora (sin inventar guías falsas)
  if (isLocal) {
    const internalRef = `NEXORA-LOCAL-${order.order_number}`;
    return transaction(db, () => {
      db.prepare(`
        UPDATE landing_orders
        SET status='sent_to_supplier',
            supplier_platform='Propio',
            supplier_order_id=?,
            dispatch_error=NULL
        WHERE id=?
      `).run(internalRef, order.id);

      if (order.order_id) {
        db.prepare("UPDATE orders SET status='pending' WHERE id=?").run(order.order_id);
      }

      logWhatsAppConfirmationEvent(db, {
        landing_order_id: order.id,
        order_number: order.order_number,
        phone: check.normalized.phone,
        direction: 'operator',
        channel: 'nexora_local',
        message_text: `Asignado a Bodega Local Nexora (${internalRef})`,
        parsed_intent: 'sent_to_supplier',
        status_before: order.status,
        status_after: 'sent_to_supplier'
      });

      return {
        ok: true,
        via_mcp: false,
        message: `Pedido #${order.order_number} liberado hacia Zona de Empaque Local (${internalRef})`,
        order_id: order.id,
        supplier_platform: 'Propio',
        supplier_order_id: internalRef,
        guide_number: order.guide_number || '',
        tracking_url: order.tracking_url || '',
        status: 'sent_to_supplier'
      };
    });
  }

  // 6. Cualquier otra plataforma externa sin adaptador API directo activo: NO inventar guías falsas
  const msg = `La plataforma "${platform}" no tiene una integración API de creación de pedidos activa. Cambia el proveedor a "Dropi" (Dropi MCP) o "Propio" (Bodega Local), o ingresa el número de guía real manualmente en Editar.`;
  db.prepare("UPDATE landing_orders SET status='supplier_error', dispatch_error=? WHERE id=?").run(msg, order.id);
  fail(409, msg);
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
      try {
        const imported = await dropiClient.importProductToNexora(db, supplierProductId, userId);
        if (imported?.master_sku) {
          masterSku = imported.master_sku;
        }
      } catch {}
    }
  }

  const variant = db.prepare('SELECT id, product_id, meibo_sku FROM variants WHERE meibo_sku=? AND active=1 LIMIT 1').get(masterSku);
  if (variant) {
    if (!supplierProductId) {
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
  const orders = db.prepare('SELECT id FROM landing_orders WHERE landing_id=?').all(landingId);
  for (const o of orders) {
    try { deleteLandingOrder(db, o.id); } catch {}
  }
  db.prepare('DELETE FROM landing_visits WHERE landing_id=?').run(landingId);
  db.prepare('DELETE FROM landing_orders WHERE landing_id=?').run(landingId);
  db.prepare('DELETE FROM landings WHERE id=?').run(landingId);
  return { ok: true, id: landingId };
}

export function getLandingOrders(db, id) {
  ensureLandingOrderSchema(db);
  const landingId = sanitizeId(id);
  const orders = db.prepare('SELECT * FROM landing_orders WHERE landing_id=? ORDER BY created_at DESC LIMIT 100').all(landingId);
  return { landing_id: landingId, orders };
}

export function toggleLandingCampaign(db, id, input = {}) {
  ensureCampaignColumn(db);
  const landingId = sanitizeId(id || input.id);
  const existing = db.prepare('SELECT * FROM landings WHERE id=?').get(landingId);
  if (!existing) fail(404, 'Landing no encontrada');

  let nextActive = existing.campaign_active ? 1 : 0;
  if (typeof input.campaign_active === 'boolean' || typeof input.campaign_active === 'number') {
    nextActive = input.campaign_active ? 1 : 0;
  } else if (input.toggle) {
    nextActive = existing.campaign_active ? 0 : 1;
  }

  db.prepare('UPDATE landings SET campaign_active=? WHERE id=?').run(nextActive, landingId);

  let visitsCleared = 0;
  if (input.reset_visits || !nextActive) {
    const res = db.prepare('DELETE FROM landing_visits WHERE landing_id=?').run(landingId);
    visitsCleared = res.changes || 0;
    if (input.reset_visits) {
      try { db.prepare('DELETE FROM landing_sessions WHERE landing_id=?').run(landingId); } catch {}
      try { db.prepare('DELETE FROM landing_funnel_events WHERE landing_id=?').run(landingId); } catch {}
      try { db.prepare("DELETE FROM landing_activity_events WHERE landing_id=? AND event_type!='purchase'").run(landingId); } catch {}
    } else {
      // Al pausar campaña, expirar los pings activos para que no queden pegados en vivo
      try { db.prepare("UPDATE landing_sessions SET last_ping='2000-01-01T00:00:00.000Z' WHERE landing_id=?").run(landingId); } catch {}
    }
  }

  return {
    ok: true,
    id: landingId,
    name: existing.name,
    campaign_active: Boolean(nextActive),
    visits_cleared: visitsCleared
  };
}
