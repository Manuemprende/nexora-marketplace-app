/**
 * Nexora Live Shopping & Subdomain Landings Engine + Wentix Radar Bridge
 * Manages Wildcard Subdomain configs (*.wentixai.digital), COD Orders (LIVE_LANDING_COD),
 * and Wentix Radar verified winning products.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { uuid, now, transaction } from './database.mjs';
import { dropiClient } from './dropi.mjs';

const DB_PATH = process.env.NEXORA_DB_PATH ?? process.env.MEIBO_DB_PATH ?? '';
const DATA_DIR = DB_PATH ? dirname(DB_PATH) : resolve('data');
const LANDINGS_DIR = resolve(DATA_DIR, 'landings');
const LIVE_ORDERS_FILE = resolve(DATA_DIR, 'live-orders.json');
const TEMPLATE_FILE = resolve('templates/live-landing/template.config.json');

const RADAR_API_URL = process.env.WENTIX_RADAR_URL || 'http://127.0.0.1:8788';
const RADAR_TOKEN_FILE = '/opt/wentix-radar/.radar-token';
const RADAR_DB_PATH = process.env.WENTIX_RADAR_DB || (existsSync('/opt/wentix-radar/data/radar.db') ? '/opt/wentix-radar/data/radar.db' : '/opt/wentix-radar/radar.db');

function getRadarApiKey() {
  if (process.env.WENTIX_RADAR_KEY) return process.env.WENTIX_RADAR_KEY;
  try {
    if (existsSync(RADAR_TOKEN_FILE)) {
      const token = readFileSync(RADAR_TOKEN_FILE, 'utf-8').trim();
      if (token) return token;
    }
  } catch {}
  return 'cdee95c8281559c323deda24e88f99f7ab35344b35cc1764';
}

function sanitizeSlug(raw = '') {
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function ensureLandingsDir() {
  try {
    if (!existsSync(LANDINGS_DIR)) {
      mkdirSync(LANDINGS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[LiveLandings] Error initializing landings directory:', err.message);
  }
}

ensureLandingsDir();

export function getLandingBySlug(rawSlug) {
  ensureLandingsDir();
  const slug = sanitizeSlug(rawSlug);
  const targetFile = resolve(LANDINGS_DIR, `${slug}.json`);
  if (existsSync(targetFile)) {
    return JSON.parse(readFileSync(targetFile, 'utf-8'));
  }
  if (existsSync(TEMPLATE_FILE)) {
    const fallback = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf-8'));
    return { ...fallback, subdomain: slug || fallback.subdomain };
  }
  return null;
}

export function listLandings(db) {
  ensureLandingsDir();
  const files = readdirSync(LANDINGS_DIR).filter(f => f.endsWith('.json'));
  const allLandings = [];

  // Load live order stats from SQLite + JSON log
  let liveOrdersLog = [];
  try {
    if (existsSync(LIVE_ORDERS_FILE)) {
      liveOrdersLog = JSON.parse(readFileSync(LIVE_ORDERS_FILE, 'utf-8'));
    }
  } catch {}

  let dbOrders = [];
  if (db) {
    try {
      dbOrders = db.prepare(`
        SELECT o.id, o.number, o.platform, o.external_reference, o.customer_name, o.status, o.created_at,
               COALESCE(SUM(oi.qty * COALESCE(oi.unit_price, 0)), 0) as total_amount,
               COALESCE(SUM(oi.qty), 0) as total_units
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.platform = 'LIVE_LANDING_COD' OR o.external_reference LIKE 'LIVE-%'
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `).all();
    } catch {}
  }

  for (const file of files) {
    try {
      const cfg = JSON.parse(readFileSync(resolve(LANDINGS_DIR, file), 'utf-8'));
      const slug = cfg.subdomain || file.replace(/\.json$/, '');
      const sku = cfg.product?.sku || '';

      const matchingDbOrders = dbOrders.filter(o =>
        (o.external_reference || '').toUpperCase().startsWith(`LIVE-${slug.toUpperCase()}-`)
      );
      const matchingLogOrders = liveOrdersLog.filter(o =>
        (o.subdomain || '').toLowerCase() === slug.toLowerCase() ||
        (sku && o.sku === sku)
      );

      const ordersCount = Math.max(matchingDbOrders.length, matchingLogOrders.length);
      const revenueClp = matchingDbOrders.length > 0
        ? matchingDbOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
        : matchingLogOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);

      const domainBase = process.env.LIVE_LANDING_DOMAIN || 'wentixai.digital';
      allLandings.push({
        slug,
        subdomain_url: `https://${slug}.${domainBase}`,
        preview_url: `/live-shop/?p=${slug}`,
        api_config_url: `/api/landings/${slug}`,
        product: cfg.product,
        video: cfg.video,
        pixels: cfg.pixels,
        bot: cfg.bot,
        nexora: cfg.nexora,
        social_proof: cfg.social_proof,
        orders_count: ordersCount,
        revenue_clp: revenueClp,
        recent_orders: matchingLogOrders.slice(0, 5),
        created_at: cfg.created_at || null,
        updated_at: cfg.updated_at || null
      });
    } catch (e) {
      // skip invalid file
    }
  }

  return allLandings.sort((a, b) => (b.orders_count - a.orders_count) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export async function createOrUpdateLiveLanding(db, input = {}, actorId = 'system') {
  ensureLandingsDir();
  const slug = sanitizeSlug(input.slug || input.subdomain || input.title || '');
  if (!slug) throw new Error('Debes indicar un slug o subdominio válido (ej: taladro, pulidor)');

  let baseTemplate = {};
  if (existsSync(TEMPLATE_FILE)) {
    baseTemplate = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf-8'));
  }

  let existingConfig = null;
  const targetFile = resolve(LANDINGS_DIR, `${slug}.json`);
  if (existsSync(targetFile)) {
    try { existingConfig = JSON.parse(readFileSync(targetFile, 'utf-8')); } catch {}
  }

  // If dropi_id is provided, fetch product info from Dropi Chile
  let dropiProduct = null;
  const dropiId = input.dropi_id ? Number(input.dropi_id) : null;
  if (dropiId) {
    try {
      dropiProduct = await dropiClient.getProductDetail(dropiId);
    } catch (e) {
      try {
        const searchRes = await dropiClient.searchProducts({ keywords: String(dropiId), pageSize: 5 });
        dropiProduct = (searchRes?.products || []).find(p => Number(p.id) === dropiId) || searchRes?.products?.[0] || null;
      } catch {}
    }
  }

  // Check if dropiId is already imported into Nexora catalog (e.g., NEX-00200)
  let linkedNexoraSku = null;
  if (db && dropiId) {
    try {
      const row = db.prepare(`
        SELECT v.meibo_sku
        FROM external_codes ec
        JOIN variants v ON v.id = ec.variant_id
        WHERE ec.platform = 'Dropi' AND ec.code = ?
        LIMIT 1
      `).get(String(dropiId));
      if (row?.meibo_sku) linkedNexoraSku = row.meibo_sku;
    } catch {}
  }

  const basePrice = Number(input.price || dropiProduct?.suggested_price || existingConfig?.product?.price || 24990);
  const compareAtPrice = Number(input.compare_at_price || Math.round((basePrice * 1.65) / 1000) * 1000 - 10);
  const title = input.title || dropiProduct?.name || existingConfig?.product?.title || `Oferta Live: ${slug.toUpperCase()}`;
  const subtitle = input.subtitle || existingConfig?.product?.subtitle || 'Envío Rápido a Todo Chile · Pagas al Recibir en tu Puerta';
  const sku = input.sku || linkedNexoraSku || (dropiId ? `DROP-CL-${dropiId}` : (existingConfig?.product?.sku || `NEX-LIVE-${slug.toUpperCase()}`));
  const stockInitial = Number(input.stock || dropiProduct?.stock || existingConfig?.product?.stock_initial || 28);
  const posterUrl = input.poster_url || input.image_url || dropiProduct?.images?.[0] || dropiProduct?.image_url || dropiProduct?.gallery?.[0] || existingConfig?.video?.poster_url || 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=900&q=80';
  const videoUrl = input.video_url || existingConfig?.video?.stream_url || 'https://assets.mixkit.co/videos/preview/mixkit-man-working-with-a-drill-on-a-piece-of-wood-41701-large.mp4';

  const price2x = Math.round((basePrice * 1.68) / 100) * 100 - 10;
  const price3x = Math.round((basePrice * 2.25) / 100) * 100 - 10;

  const packs = Array.isArray(input.packs) && input.packs.length > 0 ? input.packs : [
    {
      id: 'pack-1',
      quantity: 1,
      title: '1 Unidad',
      subtitle: 'Precio Promocional Live',
      price: basePrice,
      compare_at: compareAtPrice,
      savings: Math.max(0, compareAtPrice - basePrice),
      badge: 'PRECIO EN VIVO',
      free_shipping: true,
      is_popular: false
    },
    {
      id: 'pack-2',
      quantity: 2,
      title: 'Pack Ahorro 2 Unidades',
      subtitle: `Lleva 2 con descuento especial ($${Math.round(price2x / 2).toLocaleString('es-CL')} c/u)`,
      price: price2x,
      compare_at: compareAtPrice * 2,
      savings: Math.max(0, compareAtPrice * 2 - price2x),
      badge: 'MÁS VENDIDO 🔥',
      free_shipping: true,
      is_popular: true
    },
    {
      id: 'pack-3',
      quantity: 3,
      title: 'Pack Familiar / Mayorista 3x',
      subtitle: `Máximo ahorro garantizado ($${Math.round(price3x / 3).toLocaleString('es-CL')} c/u)`,
      price: price3x,
      compare_at: compareAtPrice * 3,
      savings: Math.max(0, compareAtPrice * 3 - price3x),
      badge: 'MEJOR OFERTA 💎',
      free_shipping: true,
      is_popular: false
    }
  ];

  const config = {
    subdomain: slug,
    dropi_id: dropiId || existingConfig?.dropi_id || null,
    product: {
      id: dropiId ? `dropi-cl-${dropiId}` : (existingConfig?.product?.id || `live-${slug}`),
      sku,
      title,
      subtitle,
      price: basePrice,
      compare_at_price: compareAtPrice,
      currency: 'CLP',
      stock_initial: stockInitial,
      badge: input.badge || existingConfig?.product?.badge || 'OFERTA EN VIVO · PAGO CONTRAENTREGA',
      highlights: input.highlights || existingConfig?.product?.highlights || [
        'Garantía de satisfacción en Chile',
        'Despacho prioritario vía Blue Express / Starken',
        'Pagas en efectivo o transferencia al recibir'
      ],
      packs
    },
    video: {
      stream_url: videoUrl,
      poster_url: posterUrl,
      aspect_ratio: '9:16',
      autoplay: true,
      loop: true,
      live_viewers_min: Number(input.viewers_min || 85),
      live_viewers_max: Number(input.viewers_max || 290)
    },
    pixels: {
      meta_pixel_id: input.meta_pixel_id !== undefined ? String(input.meta_pixel_id) : (existingConfig?.pixels?.meta_pixel_id || ''),
      tiktok_pixel_id: input.tiktok_pixel_id !== undefined ? String(input.tiktok_pixel_id) : (existingConfig?.pixels?.tiktok_pixel_id || '')
    },
    nexora: {
      endpoint: process.env.NEXORA_PUBLIC_API || 'https://nexora.wentixai.cyou/api/orders',
      channel: 'LIVE_LANDING_COD',
      country: 'CL',
      whatsapp_fallback: input.whatsapp_phone || existingConfig?.nexora?.whatsapp_fallback || '+56928148946',
      webhook_secret_header: 'live-landing-cod'
    },
    bot: {
      enabled: true,
      name: input.bot_name || existingConfig?.bot?.name || 'Camila · Asistente en Vivo',
      avatar: '🤖',
      provider: input.bot_provider || existingConfig?.bot?.provider || 'local',
      api_key: input.bot_api_key || existingConfig?.bot?.api_key || '',
      system_prompt: `Eres Camila, anfitriona del Live Shopping en Chile para el producto "${title}". Responde en máximo 2 líneas, tono chileno amable y directo. Precio 1x: $${basePrice.toLocaleString('es-CL')}, Pack 2x: $${price2x.toLocaleString('es-CL')}, Pack 3x: $${price3x.toLocaleString('es-CL')}. Envío a todo Chile con Pago Contraentrega (COD).`,
      welcome_message: `¡Bienvenidos al Live! 🎉 Hoy tenemos ${title} con Pago Contraentrega en todo Chile. Haz tu pregunta en el chat o presiona 'Comprar Contraentrega' abajo 👇`,
      faq: existingConfig?.bot?.faq || baseTemplate?.bot?.faq || [
        {
          keywords: ['precio', 'cuanto', 'valor', 'cuesta', 'vale'],
          answer: `¡Hola! 😊 1 unidad está a $${basePrice.toLocaleString('es-CL')} con envío gratis, o el Pack 2x Más Vendido por $${price2x.toLocaleString('es-CL')}. ¡Pagas al recibir!`
        },
        {
          keywords: ['envio', 'despacho', 'demora', 'llega', 'regiones', 'santiago', 'comuna'],
          answer: 'Despachamos a todo Chile continental vía Blue Express y Starken 🚚 En RM llega en 24-48 hrs hábiles y en regiones de 2 a 5 días hábiles.'
        },
        {
          keywords: ['pago', 'contraentrega', 'efectivo', 'transferencia', 'confiable'],
          answer: '¡100% seguro! 🤝 No pagas nada por adelantado. Haces tu pedido en el botón de abajo y le pagas al repartidor cuando recibes tu paquete.'
        }
      ]
    },
    social_proof: existingConfig?.social_proof || baseTemplate?.social_proof || {
      enabled: true,
      interval_seconds: 9,
      simulated_messages: [
        { user: 'Rodrigo M. (Maipú)', text: '¿Es pago contraentrega real en Santiago?' },
        { user: 'Carola V. (Concepción)', text: 'Acabo de pedir el Pack de 2 unidades, ¡gracias!' },
        { user: 'Patricio S. (Antofagasta)', text: '¿Hacen envíos al norte por Blue Express?' },
        { user: 'Javiera T. (La Florida)', text: 'Me llegó ayer, excelente calidad 10/10 🔥' }
      ],
      recent_buyers: [
        { name: 'Carlos R.', comuna: 'Puente Alto', pack: 'Pack Ahorro 2x', time_ago: 'hace 2 min' },
        { name: 'Marcela P.', comuna: 'Viña del Mar', pack: '1 Unidad', time_ago: 'hace 4 min' },
        { name: 'Jorge H.', comuna: 'Temuco', pack: 'Pack Ahorro 2x', time_ago: 'hace 7 min' }
      ]
    },
    created_at: existingConfig?.created_at || now(),
    updated_at: now()
  };

  writeFileSync(targetFile, JSON.stringify(config, null, 2), 'utf-8');

  // Ensure product/variant exists in Nexora SQLite so orders link cleanly
  const domainBase = process.env.LIVE_LANDING_DOMAIN || 'wentixai.digital';
  if (db) {
    try {
      ensureLandingVariantInDb(db, {
        sku,
        title,
        price: basePrice,
        stock: stockInitial,
        image_url: posterUrl,
        dropi_id: dropiId
      }, actorId);
      // Also register/update mapping in `landings` table so Landing Pages & Pedidos Landings stay linked
      const existingLandingRow = db.prepare('SELECT id FROM landings WHERE id=?').get(slug);
      if (existingLandingRow) {
        db.prepare(`
          UPDATE landings
          SET name=?, url=?, master_sku=?, supplier_platform=?, supplier_product_id=?, auto_fulfillment=?
          WHERE id=?
        `).run(title, `https://${slug}.${domainBase}`, sku, dropiId ? 'Dropi' : 'Dropea', dropiId ? String(dropiId) : '', dropiId ? 'dropi' : 'none', slug);
      } else {
        db.prepare(`
          INSERT INTO landings (id, name, url, master_sku, supplier_platform, supplier_product_id, auto_fulfillment, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(slug, title, `https://${slug}.${domainBase}`, sku, dropiId ? 'Dropi' : 'Dropea', dropiId ? String(dropiId) : '', dropiId ? 'dropi' : 'none', now());
      }
    } catch (e) {
      console.warn('[LiveLandings] Non-fatal variant sync note:', e.message);
    }
  }

  return {
    ok: true,
    slug,
    subdomain_url: `https://${slug}.${domainBase}`,
    preview_url: `/live-shop/?p=${slug}`,
    api_config_url: `/api/landings/${slug}`,
    config
  };
}

export function deleteLiveLanding(rawSlug) {
  ensureLandingsDir();
  const slug = sanitizeSlug(rawSlug);
  let deleted = false;
  const targetFile = resolve(LANDINGS_DIR, `${slug}.json`);
  if (existsSync(targetFile)) {
    unlinkSync(targetFile);
    deleted = true;
  }
  try {
    const files = readdirSync(LANDINGS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const fullPath = resolve(LANDINGS_DIR, file);
      const fileSlug = sanitizeSlug(file.replace(/\.json$/, ''));
      if (fileSlug === slug) {
        unlinkSync(fullPath);
        deleted = true;
        continue;
      }
      try {
        const cfg = JSON.parse(readFileSync(fullPath, 'utf-8'));
        if (sanitizeSlug(cfg.subdomain || '') === slug) {
          unlinkSync(fullPath);
          deleted = true;
        }
      } catch {}
    }
  } catch {}
  if (deleted) {
    return { ok: true, deleted: slug };
  }
  return { ok: false, error: 'Landing no encontrada' };
}

function ensureLandingVariantInDb(db, { sku, title, price, stock = 30, image_url = '', dropi_id = null }, actorId = 'system') {
  if (dropi_id) {
    const byDropi = db.prepare(`
      SELECT v.id, v.product_id
      FROM external_codes ec
      JOIN variants v ON v.id = ec.variant_id
      WHERE ec.platform = 'Dropi' AND ec.code = ?
      LIMIT 1
    `).get(String(dropi_id));
    if (byDropi) return byDropi.id;
  }
  const existing = db.prepare('SELECT id, product_id FROM variants WHERE LOWER(meibo_sku) = LOWER(?)').get(sku);
  if (existing) return existing.id;

  const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  const actor = admin?.id || actorId;
  const productId = uuid();
  const variantId = uuid();

  db.prepare(`
    INSERT INTO products (id, name, description, category, image_url, source_url, is_demo)
    VALUES (?, ?, ?, 'Live Shopping', ?, ?, 0)
  `).run(productId, title, `Producto Live Shopping (${sku})`, image_url, `https://app.dropi.cl/dashboard/products/${dropi_id || sku}`);

  db.prepare(`
    INSERT INTO variants (id, product_id, meibo_sku, attributes, price, active)
    VALUES (?, ?, ?, 'Live Shopping COD', ?, 1)
  `).run(variantId, productId, sku, price);

  db.prepare(`
    INSERT INTO inventory (variant_id, on_hand, reserved, stock_confirmed)
    VALUES (?, ?, 0, 1)
  `).run(variantId, Math.max(20, Number(stock || 30)));

  if (dropi_id) {
    db.prepare(`
      INSERT INTO external_codes (id, variant_id, platform, code, price, origin, created_at)
      VALUES (?, ?, 'Dropi', ?, ?, 'Live Landing Auto-Link', ?)
    `).run(uuid(), variantId, `DR-CL-${dropi_id}`, price, now());
  }

  return variantId;
}

export function createLiveLandingOrder(db, payload = {}) {
  const subdomain = sanitizeSlug(payload.subdomain || 'live');
  const customer = payload.customer || {};
  const shipping = payload.shipping || {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  const customerName = String(customer.name || payload.customer_name || 'Cliente Live COD').trim();
  const customerPhone = String(customer.phone || payload.customer_phone || '').trim();
  const region = String(shipping.region || payload.region || 'Región Metropolitana').trim();
  const comuna = String(shipping.comuna || payload.comuna || 'Santiago').trim();
  const address = String(shipping.address || payload.address || '').trim();
  const notes = String(shipping.notes || payload.notes || '').trim();

  if (!customerName || !customerPhone) {
    throw new Error('Nombre y teléfono del cliente son obligatorios para pedidos Contraentrega.');
  }
  if (!rawItems.length) {
    throw new Error('El pedido Live Shopping no contiene ítems.');
  }

  return transaction(db, () => {
    const adminUser = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
    const actorId = adminUser ? adminUser.id : uuid();

    const lastOrder = db.prepare('SELECT MAX(number) as n FROM orders').get();
    const nextNumber = (lastOrder?.n || 1000) + 1;
    const orderId = uuid();
    const extRef = `LIVE-${subdomain.toUpperCase()}-${nextNumber}`;
    const createdAt = now();

    let computedTotal = 0;
    const resolvedItems = [];

    for (const item of rawItems) {
      const sku = String(item.sku || `NEX-LIVE-${subdomain.toUpperCase()}`).trim();
      const qty = Math.max(1, Number(item.quantity || item.qty || 1));
      const itemTitle = String(item.title || `Producto Live ${subdomain}`).trim();
      const totalItemPrice = Number(item.total_price || (Number(item.unit_price || 24990) * qty));
      const effectiveUnitPrice = Math.round(totalItemPrice / qty);

      let variant = db.prepare('SELECT id, meibo_sku, price FROM variants WHERE LOWER(meibo_sku) = LOWER(?)').get(sku);
      if (!variant) {
        const createdVarId = ensureLandingVariantInDb(db, {
          sku,
          title: itemTitle,
          price: effectiveUnitPrice,
          stock: 30
        }, actorId);
        variant = { id: createdVarId, meibo_sku: sku, price: effectiveUnitPrice };
      }

      computedTotal += totalItemPrice;

      // Reserve inventory safely while respecting CHECK(reserved <= on_hand)
      db.prepare('UPDATE inventory SET on_hand = MAX(on_hand, reserved + ?), reserved = reserved + ? WHERE variant_id = ?').run(qty, qty, variant.id);

      resolvedItems.push({
        variant_id: variant.id,
        sku: variant.meibo_sku,
        title: itemTitle,
        pack_id: item.pack_id || `pack-${qty}`,
        qty,
        unit_price: effectiveUnitPrice,
        total_price: totalItemPrice
      });
    }

    const finalTotal = Number(payload.total || computedTotal);
    const displayCustomer = `${customerName} · ${customerPhone} · ${comuna}, ${region}${address ? ` (${address})` : ''}`;

    db.prepare(`
      INSERT INTO orders (
        id, number, platform, external_reference, customer_name,
        status, stock_policy, actor_id, created_at, inventory_allocated
      ) VALUES (?, ?, 'LIVE_LANDING_COD', ?, ?, 'pending', 'reserved', ?, ?, 1)
    `).run(orderId, nextNumber, extRef, displayCustomer.slice(0, 200), actorId, createdAt);

    for (const item of resolvedItems) {
      db.prepare(`
        INSERT INTO order_items (id, order_id, variant_id, qty, checked_qty, source_code, unit_price)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(uuid(), orderId, item.variant_id, item.qty, item.sku, item.unit_price);
    }

    db.prepare('INSERT INTO packing_events VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), orderId, null, 'created', actorId, createdAt);

    // Append structured COD record to live-orders.json for Dropi Chile 1-click dispatch
    try {
      let existingLogs = [];
      if (existsSync(LIVE_ORDERS_FILE)) {
        existingLogs = JSON.parse(readFileSync(LIVE_ORDERS_FILE, 'utf-8'));
      }
      existingLogs.unshift({
        id: orderId,
        order_number: `NEX-LIVE-${nextNumber}`,
        number: nextNumber,
        external_reference: extRef,
        channel: 'LIVE_LANDING_COD',
        subdomain,
        payment_method: 'COD',
        status: 'PENDING_CONFIRMATION',
        total: finalTotal,
        currency: 'CLP',
        customer: { name: customerName, phone: customerPhone, email: customer.email || '' },
        shipping: { region, comuna, address, notes, country: 'CL' },
        items: resolvedItems,
        sku: resolvedItems[0]?.sku || '',
        created_at: createdAt
      });
      writeFileSync(LIVE_ORDERS_FILE, JSON.stringify(existingLogs.slice(0, 500), null, 2), 'utf-8');
    } catch (e) {
      console.warn('[LiveLandings] Could not append live-orders.json:', e.message);
    }

    return {
      id: orderId,
      order_number: `NEX-LIVE-${nextNumber}`,
      number: nextNumber,
      external_reference: extRef,
      status: 'PENDING_CONFIRMATION',
      total: finalTotal
    };
  });
}

export function getLiveStock(db, sku = '') {
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) return { sku: '', stock: 24, available: true };
  if (db) {
    try {
      const row = db.prepare(`
        SELECT v.meibo_sku as sku, i.on_hand, i.reserved
        FROM variants v
        LEFT JOIN inventory i ON i.variant_id = v.id
        WHERE LOWER(v.meibo_sku) = LOWER(?)
      `).get(cleanSku);
      if (row) {
        const avail = Math.max(0, Number(row.on_hand || 0) - Number(row.reserved || 0));
        return { sku: row.sku, stock: avail > 0 ? avail : 15, available: true };
      }
    } catch {}
  }
  return { sku: cleanSku, stock: 24, available: true };
}

/**
 * Queries Wentix Radar (local port 8788 + radar.db SQLite) for verified winning products
 * ranked by real daily stock depletion and sales velocity.
 */
export async function getRadarWinners({ country = 'Chile', supplier = '', q = '', limit = 36 } = {}) {
  const maxItems = Math.max(1, Math.min(100, Number(limit) || 36));
  const results = [];
  const seenIds = new Set();
  const supFilter = String(supplier || '').trim().toLowerCase();
  const qFilter = String(q || '').trim().toLowerCase();
  const normalizedCountry = /^(cl|chile)$/i.test(String(country || 'Chile').trim()) ? 'Chile' : String(country || 'Chile').trim();

  // 1. Fast query to Wentix Radar HTTP API (port 8788 in-memory cache)
  try {
    const url = new URL('/api/v1/winners', RADAR_API_URL);
    url.searchParams.set('country', normalizedCountry);
    url.searchParams.set('currency', 'CLP');
    url.searchParams.set('limit', String(supFilter ? 150 : maxItems * 2));
    if (qFilter) url.searchParams.set('q', qFilter);

    const resp = await fetch(url.toString(), {
      headers: { 'x-api-key': getRadarApiKey() },
      signal: AbortSignal.timeout(4500)
    });
    if (resp.ok) {
      const data = await resp.json();
      const items = data.products || data.items || data.winners || [];
      for (const it of items) {
        const rawId = it.original_id || it.external_id || it.product_id || it.id || '';
        const extId = Number(String(rawId).replace(/[^0-9]/g, '')) || String(rawId);
        if (!extId || seenIds.has(String(extId))) continue;

        const providerObj = typeof it.provider === 'object' && it.provider !== null ? it.provider : null;
        const supplierName = String(
          providerObj?.name ||
          it.supplier_name ||
          (typeof it.provider === 'string' ? it.provider : '') ||
          (typeof it.supplier === 'string' ? it.supplier : '') ||
          'Proveedor Verificado Chile'
        );

        if (supFilter && !supplierName.toLowerCase().includes(supFilter)) continue;

        const title = String(it.name || it.title || 'Producto Ganador Dropi');
        const categoryName = String(it.niche || it.category || 'Ganadores Radar');
        if (qFilter && !`${title} ${categoryName} ${supplierName}`.toLowerCase().includes(qFilter)) continue;

        seenIds.add(String(extId));

        const rawCost = Number(it.prices?.cost_local || it.cost_local || it.prices?.cost || it.supplier_price_clp || it.price_clp || it.price || 6990);
        const cost = rawCost > 100 ? Math.round(rawCost) : 6990;
        const rawSuggested = Number(it.prices?.suggested_sell_price || it.suggested_price_clp || it.suggested_price || 0);
        const suggested = rawSuggested >= cost * 1.25
          ? Math.round(rawSuggested)
          : Math.round((cost * 2.2) / 1000) * 1000 - 10;

        let img = String(it.image_url || it.image || it.thumbnail || '');
        if (img && !img.startsWith('http')) {
          img = `https://d39ru7awumhhs2.cloudfront.net/${img.replace(/^\/+/, '')}`;
        }

        const stockDelta = Math.abs(Number(it.metrics?.stock_units_delta_24h || 0));
        const unitsSold = Number(it.metrics?.sales_7d || it.metrics?.sales_or_orders || stockDelta || it.sales_7d || it.sales_count || 25);

        results.push({
          id: extId,
          name: title,
          sku: `DROP-CL-${extId}`,
          supplier: supplierName,
          supplier_id: providerObj?.id || it.supplier_id || null,
          category: categoryName,
          cost_price: cost,
          sale_price: cost,
          suggested_price: suggested,
          profit_margin: suggested - cost,
          margin_pct: Math.round(((suggested - cost) / suggested) * 100),
          stock: Number(it.current_stock || it.metrics?.current_stock || it.stock || 45),
          units_sold_radar: unitsSold > 0 ? unitsSold : 24,
          radar_score: Number(it.scores?.winner_score || it.winner_score || it.score || 95),
          image_url: img,
          is_radar_winner: true
        });

        if (results.length >= maxItems) break;
      }
    }
  } catch (err) {
    console.warn('[RadarBridge] HTTP API fallback notice:', err.message);
  }

  // 2. Direct query to Wentix Radar SQLite (/opt/wentix-radar/data/radar.db) if results < maxItems
  if (results.length < maxItems && existsSync(RADAR_DB_PATH)) {
    try {
      const radarDb = new DatabaseSync(RADAR_DB_PATH, { open: true, readOnly: true });
      const clauses = ["LOWER(country) IN ('cl', 'chile')"];
      const params = [];

      if (supFilter) {
        clauses.push('(LOWER(supplier) LIKE ? OR CAST(supplier_id AS TEXT) = ?)');
        params.push(`%${supFilter}%`, supFilter);
      }
      if (qFilter) {
        clauses.push('(LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(supplier) LIKE ?)');
        params.push(`%${qFilter}%`, `%${qFilter}%`, `%${qFilter}%`);
      }

      const sql = `
        SELECT 
          id, name, supplier, supplier_id, category,
          price, suggested_price, current_stock, previous_stock,
          (COALESCE(previous_stock, current_stock) - COALESCE(current_stock, 0)) AS stock_depletion,
          ad_matches, image
        FROM products
        WHERE ${clauses.join(' AND ')}
          AND COALESCE(current_stock, 0) > 0
          AND COALESCE(price, 0) >= 500
        ORDER BY 
          (COALESCE(previous_stock, current_stock) - COALESCE(current_stock, 0)) DESC,
          COALESCE(ad_matches, 0) DESC,
          COALESCE(current_stock, 0) DESC
        LIMIT ?
      `;
      const rows = radarDb.prepare(sql).all(...params, maxItems * 2);
      radarDb.close();

      for (const r of rows) {
        const extId = Number(String(r.id || '').replace(/[^0-9]/g, '')) || String(r.id || '');
        if (!extId || seenIds.has(String(extId))) continue;
        seenIds.add(String(extId));

        const cost = Math.max(500, Math.round(Number(r.price || 6990)));
        const rawSuggested = Number(r.suggested_price || 0);
        const suggested = rawSuggested >= cost * 1.25
          ? Math.round(rawSuggested)
          : Math.round((cost * 2.2) / 1000) * 1000 - 10;
        const depletion = Math.max(0, Number(r.stock_depletion || 0));
        const unitsSold = depletion > 0 ? depletion : Math.max(14, Number(r.ad_matches || 0) * 8 + 15);

        let img = String(r.image || '');
        if (img && !img.startsWith('http')) {
          img = `https://d39ru7awumhhs2.cloudfront.net/${img.replace(/^\/+/, '')}`;
        } else if (img.includes('app.dropi.cl/') || img.includes('dropi-media.s3')) {
          const clean = img.replace(/^https?:\/\/[^/]+\//, '');
          img = `https://d39ru7awumhhs2.cloudfront.net/${clean}`;
        }

        results.push({
          id: extId,
          name: String(r.name || 'Producto Ganador Dropi'),
          sku: `DROP-CL-${extId}`,
          supplier: String(r.supplier || 'Proveedor Verificado Chile'),
          supplier_id: r.supplier_id || null,
          category: String(r.category || 'Tendencias Chile'),
          cost_price: cost,
          sale_price: cost,
          suggested_price: suggested,
          profit_margin: suggested - cost,
          margin_pct: Math.round(((suggested - cost) / suggested) * 100),
          stock: Number(r.current_stock || 0),
          previous_stock: Number(r.previous_stock || r.current_stock || 0),
          units_sold_radar: unitsSold,
          radar_score: 94,
          image_url: img,
          is_radar_winner: true
        });

        if (results.length >= maxItems) break;
      }
    } catch (err) {
      console.warn('[RadarBridge] Direct SQLite read warning:', err.message);
    }
  }

  return {
    ok: true,
    total: results.length,
    winners: results.slice(0, maxItems)
  };
}
