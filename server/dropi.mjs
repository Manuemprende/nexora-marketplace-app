/**
 * Dropi Chile Integration Engine
 * Full bidirectional seller/dropshipper & supplier connector for Dropi
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DROPI_AUTH_URL = 'https://api-v2.dropi.cl/bff/auth/core/login';
const DROPI_API_BASE = 'https://api.dropi.cl/api';

const DEFAULT_CONFIG = {
  email: process.env.DROPI_EMAIL || 'man.emprendehoy@gmail.com',
  password: process.env.DROPI_PASSWORD || 'Swj8$f!2!juNT4P',
  white_brand_id: 4,
  country: 'CHILE',
  token: null,
  expires_at: 0,
  user_id: 469711
};

const TOKEN_CACHE_FILE = process.env.DROPI_CACHE_FILE || (process.platform === 'win32' ? resolve('data/dropi-session.json') : '/var/lib/nexora/dropi-session.json');

export function formatDropiImageUrl(urlS3, fallbackUrl = null) {
  if (urlS3) {
    if (urlS3.startsWith('http://') || urlS3.startsWith('https://')) {
      if (urlS3.includes('dropi-media.s3.amazonaws.com/')) {
        const path = urlS3.split('dropi-media.s3.amazonaws.com/')[1];
        return encodeURI(`https://d39ru7awumhhs2.cloudfront.net/${path}`);
      }
      return encodeURI(urlS3);
    }
    const cleanPath = urlS3.startsWith('/') ? urlS3.slice(1) : urlS3;
    return encodeURI(`https://d39ru7awumhhs2.cloudfront.net/${cleanPath}`);
  }
  if (fallbackUrl) {
    if (fallbackUrl.includes('dropi-media.s3.amazonaws.com/')) {
      const path = fallbackUrl.split('dropi-media.s3.amazonaws.com/')[1];
      return encodeURI(`https://d39ru7awumhhs2.cloudfront.net/${path}`);
    }
    return encodeURI(fallbackUrl);
  }
  return null;
}

export function computeDropiVariationStock(v, privateInventories = [], currentUserId = 469711) {
  const vWh = (v?.warehouse_product_variation || []).reduce((s, w) => s + Number(w?.stock || 0), 0);
  const rawStock = vWh > 0 ? vWh : Number(v?.stock || 0);
  const privReserved = (privateInventories || [])
    .filter(pi => Number(pi?.variation_id) === Number(v?.id) && Number(pi?.user_id) !== Number(currentUserId))
    .reduce((s, pi) => s + Number(pi?.stock || 0), 0);
  return Math.max(0, Math.round(rawStock - privReserved));
}

export function computeDropiProductStock(p, currentUserId = 469711) {
  const privList = Array.isArray(p?.private_product_inventories) ? p.private_product_inventories : [];
  if (Array.isArray(p?.variations) && p.variations.length > 0) {
    const varStock = p.variations.reduce((sum, v) => sum + computeDropiVariationStock(v, privList, currentUserId), 0);
    if (varStock > 0) return varStock;
  }
  const whStock = (p?.warehouse_product || []).reduce((sum, w) => sum + Number(w?.stock || 0), 0);
  if (whStock > 0) {
    const privTotal = privList
      .filter(pi => Number(pi?.user_id) !== Number(currentUserId))
      .reduce((s, pi) => s + Number(pi?.stock || 0), 0);
    return Math.max(0, Math.round(whStock - privTotal));
  }
  return Math.max(0, Math.round(Number(p?.stock || 0)));
}

class NexoraDropiEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadCachedToken();
  }

  loadCachedToken() {
    try {
      const authFile = process.platform === 'win32' ? resolve('data/dropi-auth.json') : '/var/lib/nexora/dropi-auth.json';
      if (existsSync(authFile)) {
        const auth = JSON.parse(readFileSync(authFile, 'utf-8'));
        if (auth.token) {
          const claims = JSON.parse(Buffer.from(auth.token.split('.')[1], 'base64url').toString());
          if (claims.exp && claims.exp > Math.floor(Date.now() / 1000) + 600) {
            this.config.token = auth.token;
            this.config.expires_at = claims.exp;
            if (auth.user?.id) this.config.user_id = auth.user.id;
            return;
          }
        }
      }
      if (existsSync(TOKEN_CACHE_FILE)) {
        const cached = JSON.parse(readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
        if (cached.token && cached.expires_at) {
          this.config.token = cached.token;
          this.config.expires_at = cached.expires_at;
          if (cached.user_id) this.config.user_id = cached.user_id;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  saveCachedToken() {
    try {
      writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
        token: this.config.token,
        expires_at: this.config.expires_at,
        user_id: this.config.user_id,
        updated_at: new Date().toISOString()
      }, null, 2), 'utf-8');
    } catch (e) {
      // ignore
    }
  }

  async ensureToken() {
    const now = Math.floor(Date.now() / 1000);
    // Refresh if missing or expiring within 10 minutes (600s)
    if (this.config.token && this.config.expires_at > now + 600) {
      return this.config.token;
    }

    const payload = {
      email: this.config.email,
      password: this.config.password,
      white_brand_id: this.config.white_brand_id
    };

    const res = await fetch(DROPI_AUTH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
        'origin': 'https://app.dropi.cl',
        'referer': 'https://app.dropi.cl/'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Error de autenticación en Dropi (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    const token = data.data?.token || data.token;
    if (!token) {
      throw new Error(`Respuesta de login inválida de Dropi: ${JSON.stringify(data)}`);
    }

    // Decode JWT payload to get exp
    try {
      const parts = token.split('.');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      this.config.expires_at = claims.exp || (now + 14400);
      this.config.user_id = claims.sub ? parseInt(claims.sub, 10) : this.config.user_id;
    } catch (err) {
      this.config.expires_at = now + 14400; // 4 hours fallback
    }

    this.config.token = token;
    this.saveCachedToken();
    return this.config.token;
  }

  getHeaders(token) {
    return {
      'content-type': 'application/json',
      'accept': 'application/json, text/plain, */*',
      'x-authorization': 'Bearer ' + token,
      'x-captcha-token': '',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
      'sec-ch-ua-platform': '"Windows"',
      'sec-ch-ua-mobile': '?0',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'origin': 'https://app.dropi.cl',
      'referer': 'https://app.dropi.cl/'
    };
  }

  async searchProducts({
    keywords = '',
    pageSize = 36,
    startData = 0,
    country = 'CHILE',
    userVerified = false,
    categories_id = null,
    supplier_id = null
  } = {}) {
    const token = await this.ensureToken();
    const body = {
      pageSize,
      startData,
      keywords: keywords || '',
      privated_product: false,
      userVerified,
      favorite: false,
      with_collection: true,
      get_stock: false,
      no_count: false,
      search_type: 'simple',
      country
    };

    if (categories_id) {
      body.categories_id = categories_id;
    }
    if (supplier_id) {
      body.supplier_id = Number(supplier_id);
    }

    const res = await fetch(`${DROPI_API_BASE}/products/v4/index`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`Dropi search error (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    const objects = data.objects || [];

    return {
      total: objects.length,
      startData,
      pageSize,
      products: objects.map(p => {
        const totalStock = computeDropiProductStock(p);
        const firstVar = (p.variations || [])[0] || null;
        const rawCost = Number(p.sale_price || firstVar?.sale_price || 0);
        const rawSugg = Number(p.suggested_price || firstVar?.suggested_price || 0);
        const suggestedPrice = rawSugg >= rawCost * 1.15 ? rawSugg : 0;
        const mainImage = (p.gallery || []).find(g => g.main)?.urlS3 || p.gallery?.[0]?.urlS3;
        const mainUrl = (p.gallery || []).find(g => g.main)?.url || p.gallery?.[0]?.url;
        const imageUrl = formatDropiImageUrl(mainImage, mainUrl);

        return {
          id: p.id,
          sku: p.sku || `DROPI-${p.id}`,
          name: p.name,
          type: p.type,
          cost_price: rawCost,
          suggested_price: suggestedPrice,
          profit_margin: suggestedPrice && rawCost ? (suggestedPrice - rawCost) : 0,
          margin_pct: suggestedPrice && rawCost ? Math.round(((suggestedPrice - rawCost) / suggestedPrice) * 100) : 0,
          stock: totalStock,
          warehouses: (p.warehouse_product || []).map(w => ({
            warehouse_id: w.warehouse_id,
            stock: w.stock
          })),
          supplier: {
            id: p.user?.id,
            name: p.user?.store_name || p.user?.name || 'Proveedor Dropi',
            verified: p.user?.category_user?.name === 'VERIFICADO' || p.user?.verified_user
          },
          categories: (p.categories || []).map(c => c.name),
          image_url: imageUrl,
          gallery: (p.gallery || []).map(g => formatDropiImageUrl(g.urlS3, g.url)).filter(Boolean),
          description: p.description || '',
          variations_count: (p.variations || []).length
        };
      })
    };
  }

  async getProductDetail(productId) {
    const cleanId = String(productId || '').replace(/^(dropi-)?Chile-/i, '').trim();
    try {
      const token = await this.ensureToken();
      let res = await fetch(`${DROPI_API_BASE}/products/v2/${cleanId}`, {
        headers: this.getHeaders(token)
      });
      if (!res.ok) {
        res = await fetch(`${DROPI_API_BASE}/products/${cleanId}`, {
          headers: this.getHeaders(token)
        });
      }

      if (res.ok) {
        const data = await res.json();
        if (data?.isSuccess !== false && data?.objects) {
          const p = data.objects || data;
          const totalStock = computeDropiProductStock(p);
          const firstVar = (p.variations || [])[0] || null;
          const rawCost = Number(p.sale_price || firstVar?.sale_price || 0);
          const rawSugg = Number(p.suggested_price || firstVar?.suggested_price || 0);
          const images = (p.gallery || []).map(g => formatDropiImageUrl(g.urlS3, g.url)).filter(Boolean);

          return {
            id: p.id || cleanId,
            sku: p.sku || `DROPI-${p.id || cleanId}`,
            name: p.name,
            description: p.description || '',
            type: p.type || 'SIMPLE',
            cost_price: rawCost,
            suggested_price: rawSugg >= rawCost * 1.15 ? rawSugg : 0,
            stock: totalStock,
            images,
            categories: (p.categories || []).map(c => c.name).filter(Boolean),
            supplier: {
              id: p.user?.id,
              name: p.user?.store_name || p.user?.name || 'Proveedor Dropi Chile',
              phone: p.user?.phone,
              warehouses: p.user?.warehouses || []
            },
            variations: (p.variations || []).map(v => ({
              id: v.id,
              sku: v.sku,
              stock: computeDropiVariationStock(v, p.private_product_inventories || []),
              raw_warehouse_stock: (v.warehouse_product_variation || []).reduce((s, w) => s + Number(w?.stock || 0), 0) || Number(v.stock || 0),
              sale_price: Number(v.sale_price || rawCost || 0),
              suggested_price: Number(v.suggested_price || 0),
              attribute_values: v.attribute_values || []
            })),
            warehouses: p.warehouse_product || []
          };
        }
      }
    } catch (e) {
      // Fall through to catalog search / Radar SQLite fallback
    }

    // Fallback 1: Search via Dropi catalog index endpoint
    try {
      const searchRes = await this.searchProducts({ keywords: cleanId, pageSize: 20 });
      const found = (searchRes?.products || []).find(p => String(p.id) === cleanId) || searchRes?.products?.[0];
      if (found) {
        const imgs = Array.isArray(found.gallery) && found.gallery.length > 0
          ? found.gallery
          : (found.image_url ? [found.image_url] : []);
        return {
          id: found.id || cleanId,
          sku: found.sku || `DROPI-${cleanId}`,
          name: found.name || `Producto Dropi #${cleanId}`,
          description: found.description || '',
          type: found.type || 'SIMPLE',
          cost_price: Number(found.cost_price || found.sale_price || 6990),
          suggested_price: Number(found.suggested_price || 0),
          stock: Number(found.stock ?? 0),
          images: imgs,
          categories: Array.isArray(found.categories) ? found.categories : [],
          supplier: {
            id: found.supplier?.id || null,
            name: found.supplier?.name || (typeof found.supplier === 'string' ? found.supplier : 'Proveedor Dropi Chile'),
            phone: found.supplier?.phone || null,
            warehouses: []
          },
          variations: found.variations || [],
          warehouses: found.warehouses || []
        };
      }
    } catch {}

    // Fallback 2: Check local Wentix Radar SQLite database (/opt/wentix-radar/data/radar.db)
    const radarPath = existsSync('/opt/wentix-radar/data/radar.db') ? '/opt/wentix-radar/data/radar.db' : '/opt/wentix-radar/radar.db';
    if (existsSync(radarPath)) {
      try {
        const { DatabaseSync } = await import('node:sqlite');
        const rdb = new DatabaseSync(radarPath, { open: true, readOnly: true });
        const row = rdb.prepare(`
          SELECT id, name, supplier, supplier_id, category, price, suggested_price, current_stock, image
          FROM products
          WHERE id IN (?, ?)
          LIMIT 1
        `).get(`Chile-${cleanId}`, cleanId);
        rdb.close();
        if (row) {
          const cost = Number(row.price || 6990);
          const rawSugg = Number(row.suggested_price || 0);
          return {
            id: cleanId,
            sku: `DROPI-${cleanId}`,
            name: row.name || `Producto Dropi #${cleanId}`,
            description: '',
            type: 'SIMPLE',
            cost_price: cost,
            suggested_price: rawSugg >= cost * 1.25 ? rawSugg : Math.round((cost * 2.1) / 1000) * 1000 - 10,
            stock: Math.max(1, Number(row.current_stock || 15)),
            images: row.image ? [row.image] : [],
            categories: row.category ? String(row.category).split(',').map(s => s.trim()).filter(Boolean) : [],
            supplier: {
              id: row.supplier_id || null,
              name: row.supplier || 'Proveedor Dropi Chile',
              phone: null,
              warehouses: []
            },
            variations: [],
            warehouses: []
          };
        }
      } catch {}
    }

    throw new Error(`No se encontró información del producto Dropi #${cleanId}`);
  }

  async getOrders({ result_number = 30, start = 0 } = {}) {
    const token = await this.ensureToken();
    const userId = this.config.user_id || 469711;
    const url = `${DROPI_API_BASE}/orders/myorders/v2?result_number=${result_number}&start=${start}&user_id=${userId}`;

    const res = await fetch(url, {
      headers: this.getHeaders(token)
    });

    if (!res.ok) {
      throw new Error(`Dropi orders error (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    const objects = data.objects || [];

    return {
      total: data.count || objects.length,
      orders: objects.map(o => ({
        id: o.id,
        dropi_order_id: o.id,
        created_at: o.created_at,
        status: o.status,
        total: o.total,
        carrier: o.carrier?.name || o.transportadora?.name || o.carrier_name || 'Blue Express',
        guide_number: o.guide_number || o.numero_guia || null,
        tracking_url: o.guide_number ? `https://www.bluex.cl/seguimiento?guia=${o.guide_number}` : null,
        cod: !!o.con_recaudo,
        customer: {
          name: `${o.name || ''} ${o.surname || ''}`.trim(),
          phone: o.phone,
          address: o.address,
          city: o.city?.name || o.city_name,
          department: o.department?.name || o.department_name
        },
        items: (o.order_items || o.items || []).map(i => ({
          product_id: i.product_id,
          name: i.product?.name || i.product_name,
          quantity: i.quantity,
          price: i.price
        }))
      }))
    };
  }

  async getSuppliers({ result_number = 50, start = 0, query = '' } = {}) {
    const token = await this.ensureToken();

    // If query provided, search specific suppliers
    if (query && query.trim()) {
      const q = query.trim();
      const url = `${DROPI_API_BASE}/users/getDataProductsSuplier?type_user=SUPPLIER&result_number=${result_number}&start=${start}&textToSearch=${encodeURIComponent(q)}&user_verified=null&orderby=random&categories_id=2`;
      const res = await fetch(url, { headers: this.getHeaders(token) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.objects || []).map(s => ({
        id: s.id,
        name: s.store_name || s.name,
        phone: s.phone,
        verified: s.verified_user || s.category_user?.name === 'VERIFICADO',
        products_count: s.products_count,
        categories: s.categories_name || [],
        warehouses: (s.warehouses || []).map(w => ({
          id: w.id,
          name: w.name,
          city: w.city?.name,
          address: w.address
        }))
      }));
    }

    // Cache check for full directory
    if (this._suppliersCache && (Date.now() - (this._suppliersCacheTime || 0) < 10 * 60 * 1000)) {
      return this._suppliersCache;
    }

    const catIds = [103, 7, 3, 4, 5, 1, 9, 20, 2];
    const results = await Promise.all(catIds.map(async catId => {
      try {
        const url = `${DROPI_API_BASE}/users/getDataProductsSuplier?type_user=SUPPLIER&result_number=50&start=0&textToSearch=&user_verified=null&orderby=random&categories_id=${catId}`;
        const res = await fetch(url, { headers: this.getHeaders(token) });
        if (!res.ok) return [];
        const data = await res.json();
        return data.objects || [];
      } catch (e) {
        return [];
      }
    }));

    const map = new Map();
    for (const list of results) {
      for (const s of list) {
        if (!map.has(s.id)) {
          map.set(s.id, {
            id: s.id,
            name: s.store_name || s.name,
            phone: s.phone,
            verified: s.verified_user || s.category_user?.name === 'VERIFICADO',
            products_count: s.products_count,
            categories: s.categories_name || [],
            warehouses: (s.warehouses || []).map(w => ({
              id: w.id,
              name: w.name,
              city: w.city?.name,
              address: w.address
            }))
          });
        }
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => (b.products_count || 0) - (a.products_count || 0));
    this._suppliersCache = sorted;
    this._suppliersCacheTime = Date.now();
    return sorted;
  }

  /**
   * Import a product from Dropi directly into Nexora's master catalog
   */
  async importProductToNexora(db, dropiProductId, actorId = 'mcp-system-actor', fallbackProduct = null) {
    const cleanId = String(dropiProductId ?? fallbackProduct?.id ?? '').replace(/^(dropi-)?Chile-/i, '').trim();
    if (!cleanId) throw new Error('ID de producto Dropi inválido');

    let detail = null;
    try {
      detail = await this.getProductDetail(cleanId);
    } catch (e) {
      if (!fallbackProduct) throw e;
    }

    const fbSupplierName = typeof fallbackProduct?.supplier === 'object'
      ? fallbackProduct?.supplier?.name
      : fallbackProduct?.supplier;
    const supplierName = detail?.supplier?.name || fbSupplierName || 'Proveedor Dropi Chile';
    const productName = detail?.name || fallbackProduct?.name || `Producto Dropi #${cleanId}`;
    const costPrice = Math.max(100, Math.round(Number(detail?.cost_price || fallbackProduct?.cost_price || fallbackProduct?.sale_price || 6990)));
    const rawSuggested = Number(detail?.suggested_price || fallbackProduct?.suggested_price || 0);
    const retailPrice = rawSuggested >= costPrice * 1.15
      ? Math.round(rawSuggested)
      : Math.round((costPrice * 1.85) / 100) * 100 - 10;
    const initialStock = Math.max(0, Number((detail && detail.stock > 0 ? detail.stock : null) ?? fallbackProduct?.stock ?? detail?.stock ?? 0));
    const primaryImage = detail?.images?.[0] || fallbackProduct?.image_url || fallbackProduct?.gallery?.[0] || '';
    const primaryCategory = detail?.categories?.[0] || fallbackProduct?.categories?.[0] || fallbackProduct?.category || 'Catálogo Dropi Chile';
    const description = detail?.description || fallbackProduct?.description || `Importado desde Dropi Chile (ID: ${cleanId}) - Proveedor: ${supplierName}`;
    const dropiCode = String(detail?.id || cleanId);

    // 1. Check if already linked via external_codes -> update stock with real Dropi stock
    const existingCode = db.prepare("SELECT variant_id FROM external_codes WHERE platform='Dropi' AND code=?").get(cleanId);
    if (existingCode) {
      const v = db.prepare("SELECT v.*, p.name FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?").get(existingCode.variant_id);
      if (v) {
        if (initialStock > 0) {
          db.prepare("UPDATE inventory SET on_hand=?, stock_confirmed=1 WHERE variant_id=?").run(initialStock, v.id);
        }
        return {
          success: true,
          action: 'already_exists',
          product_id: v.product_id,
          variant_id: v.id,
          name: v.name,
          sku: v.meibo_sku,
          stock: initialStock
        };
      }
    }

    // Resolve valid actor_id in users table (to satisfy foreign key if any)
    let validActorId = actorId;
    try {
      const u = db.prepare('SELECT id FROM users WHERE id=?').get(actorId);
      if (!u) {
        validActorId = db.prepare('SELECT id FROM users ORDER BY rowid ASC LIMIT 1').get()?.id || null;
      }
    } catch {}

    // 2. Generate unique Nexora SKU
    const rows = db.prepare("SELECT meibo_sku FROM variants WHERE meibo_sku LIKE 'NEX-%'").all();
    let maxNum = 200;
    for (const r of rows) {
      const m = /^NEX-(\d+)$/i.exec(String(r.meibo_sku || '').trim());
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= maxNum) maxNum = n + 1;
      }
    }
    const masterSku = `NEX-${String(maxNum).padStart(5, '0')}`;

    // 3. Create Product, Variant, Inventory, Movement & External Code
    const productId = crypto.randomUUID();
    const variantId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO products (id, name, description, category, image_url, source_url, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).run(
        productId,
        productName,
        description,
        primaryCategory,
        primaryImage,
        `https://app.dropi.cl/dashboard/search?search=${encodeURIComponent(productName)}`
      );

      db.prepare(`
        INSERT INTO variants (id, product_id, meibo_sku, attributes, price, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        variantId,
        productId,
        masterSku,
        detail?.type || 'Único',
        retailPrice
      );

      db.prepare(`
        INSERT INTO inventory (variant_id, on_hand, reserved, stock_confirmed)
        VALUES (?, ?, 0, 1)
      `).run(variantId, initialStock);

      db.prepare(`
        INSERT INTO inventory_movements (id, variant_id, type, delta, before_qty, after_qty, reason, actor_id, reference_id, created_at)
        VALUES (?, ?, 'initial', ?, 0, ?, ?, ?, 'dropi-import', ?)
      `).run(
        crypto.randomUUID(),
        variantId,
        initialStock,
        initialStock,
        `Sincronización inicial desde catálogo Dropi Chile #${dropiCode} (${supplierName})`,
        validActorId,
        nowIso
      );

      db.prepare(`
        INSERT INTO external_codes (id, variant_id, platform, code, origin, created_at, price)
        VALUES (?, ?, 'Dropi', ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        variantId,
        dropiCode,
        `Dropi Chile Supplier: ${supplierName}`,
        nowIso,
        costPrice
      );

      db.exec('COMMIT');

      return {
        success: true,
        action: 'imported',
        product_id: productId,
        variant_id: variantId,
        name: productName,
        sku: masterSku,
        dropi_id: dropiCode,
        supplier: supplierName,
        cost_price: costPrice,
        retail_price: retailPrice,
        stock: initialStock
      };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Sync Dropi seller orders into Nexora's orders and order_items tables
   */
  async syncOrdersToNexora(db, actorId = 'mcp-system-actor') {
    const { orders: dropiOrders } = await this.getOrders({ result_number: 50 });
    let createdCount = 0;
    let updatedCount = 0;

    for (const dOrder of dropiOrders) {
      const extRef = String(dOrder.dropi_order_id);
      const existing = db.prepare("SELECT id, status FROM orders WHERE platform='Dropi' AND external_reference=?").get(extRef);

      // Map Dropi status to Nexora internal status
      // Dropi statuses: GENERADO, PENDIENTE, GUIA GENERADA, ENVIADO, ENTREGADO, CANCELADO, DEVOLUCION
      let nexoraStatus = 'pending';
      const upStatus = (dOrder.status || '').toUpperCase();
      if (upStatus.includes('ENTREGADO') || upStatus.includes('FINALIZADO')) {
        nexoraStatus = 'packed'; // or delivered
      } else if (upStatus.includes('ENVIADO') || upStatus.includes('TRANSITO')) {
        nexoraStatus = 'packed';
      } else if (upStatus.includes('CANCEL') || upStatus.includes('DEVOL')) {
        nexoraStatus = 'cancelled';
      } else {
        nexoraStatus = 'pending';
      }

      if (existing) {
        if (existing.status !== nexoraStatus) {
          db.prepare("UPDATE orders SET status=? WHERE id=?").run(nexoraStatus, existing.id);
          updatedCount++;
        }
        continue;
      }

      // Create new order
      const maxOrderRow = db.prepare("SELECT MAX(number) max_num FROM orders").get();
      const nextOrderNumber = (maxOrderRow?.max_num || 0) + 1;
      const orderId = crypto.randomUUID();
      const nowIso = dOrder.created_at || new Date().toISOString();

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`
          INSERT INTO orders (id, number, platform, external_reference, customer_name, status, stock_policy, actor_id, created_at)
          VALUES (?, ?, 'Dropi', ?, ?, ?, 'reserved', ?, ?)
        `).run(
          orderId,
          nextOrderNumber,
          extRef,
          dOrder.customer?.name || 'Cliente Dropi',
          nexoraStatus,
          actorId,
          nowIso
        );

        // Add order items
        for (const item of (dOrder.items || [])) {
          // Find matching variant by Dropi product id in external_codes
          let variant = db.prepare(`
            SELECT v.id, v.meibo_sku, ec.price
            FROM external_codes ec
            JOIN variants v ON v.id=ec.variant_id
            WHERE ec.platform='Dropi' AND ec.code=?
          `).get(String(item.product_id));

          // If no variant linked yet, fall back to first active variant in catalog
          if (!variant) {
            variant = db.prepare("SELECT id, meibo_sku, price FROM variants WHERE active=1 LIMIT 1").get();
          }

          if (variant) {
            db.prepare(`
              INSERT INTO order_items (id, order_id, variant_id, qty, checked_qty, source_code, unit_price)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              orderId,
              variant.id,
              item.quantity || 1,
              nexoraStatus === 'packed' ? (item.quantity || 1) : 0,
              String(item.product_id || variant.meibo_sku),
              item.price || variant.price || 0
            );
          }
        }

        db.exec('COMMIT');
        createdCount++;
      } catch (e) {
        db.exec('ROLLBACK');
        console.error(`Error importando orden ${extRef} de Dropi:`, e.message);
      }
    }

    return {
      synced_at: new Date().toISOString(),
      dropi_orders_found: dropiOrders.length,
      created_in_nexora: createdCount,
      updated_in_nexora: updatedCount
    };
  }
}

export const dropiClient = new NexoraDropiEngine();

export class DropiClient {
  constructor({token,user,fetchImpl=fetch,delayMs=600}) {
    if(!token||!Number.isSafeInteger(user?.id))throw new Error('Se requiere sesión Dropi válida');
    this.user=user;this.fetch=fetchImpl;this.delayMs=delayMs;
    this.headers={'Content-Type':'application/json',Accept:'application/json, text/plain, */*',Origin:'https://app.dropi.cl',Referer:'https://app.dropi.cl/','X-Authorization':`Bearer ${token}`,Authorization:`Bearer ${token}`,'X-Host':'cl','X-Country-Code':'CL'};
  }
  async request(path,body) {
    const response=await this.fetch('https://api-v2.dropi.cl'+path,{method:body?'POST':'GET',headers:this.headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Dropi HTTP ${response.status}; sincronización detenida`);
    const result=await response.json();
    if(result.is_successful!==true)throw new Error('Dropi no confirmó la consulta');
    return result.data;
  }
  async catalog(onPage=()=>{}) {
    const products=[],ids=new Set();let expected;
    for(let page=1;page<=1000;page++) {
      const data=await this.request(`/bff/catalog/products/produit/${this.user.id}/owner`,{keywords:'',pageSize:100,page,warehouse_id:null,get_stock:false,user_id:this.user.id});
      if(!Array.isArray(data?.record)||!Number.isSafeInteger(data.count_record))throw new Error('Respuesta de catálogo inválida');
      expected??=data.count_record;
      if(expected!==data.count_record)throw new Error('El catálogo cambió durante la captura; repetir para verificar integridad');
      for(const row of data.record){if(row.id==null||ids.has(String(row.id)))throw new Error('ID ausente o repetido en la paginación');ids.add(String(row.id));products.push(row);}
      await onPage({page,rows:data.record.length,captured:products.length,expected});
      if(products.length>=expected||data.record.length<100)break;
      await new Promise(resolve=>setTimeout(resolve,this.delayMs));
    }
    if(products.length!==expected)throw new Error(`Captura incompleta: ${products.length}/${expected}`);
    return {captured_at:new Date().toISOString(),expected,complete:true,products};
  }
  async orders({from,until,supplierId=this.user.id},onPage=()=>{}) {
    const startDate=Date.parse(from),endDate=Date.parse(until);
    if(!Number.isFinite(startDate)||!Number.isFinite(endDate)||endDate<startDate||endDate-startDate>89*86400000)throw new Error('Los pedidos requieren un rango máximo de 89 días');
    if(![this.user.id,this.user.parent_id].includes(supplierId))throw new Error('Proveedor fuera del alcance de esta cuenta');
    const orders=[],ids=new Set();let ended=false;
    for(let start=0;start<100000;start+=100){
      const query=new URLSearchParams({supplier_id:String(supplierId),result_number:'100',start:String(start),orderBy:'id',orderDirection:'desc',warranty:'false',from,until,radio_downloaded:'IMPRESAS Y NO IMPRESAS'});
      const data=await this.request('/bff/orders/myorders/v2?'+query);
      if(!Array.isArray(data?.objects))throw new Error('Respuesta de pedidos inválida');
      for(const row of data.objects){if(row.id==null||ids.has(String(row.id)))throw new Error('Pedido repetido o sin ID');ids.add(String(row.id));orders.push(row);}
      await onPage({start,rows:data.objects.length,captured:orders.length});
      if(data.objects.length<100){ended=true;break;}await new Promise(resolve=>setTimeout(resolve,this.delayMs));
    }
    if(!ended)throw new Error('Paginación de pedidos incompleta');
    return {captured_at:new Date().toISOString(),from,until,supplier_id:supplierId,orders,transport_complete:true,operational_validated:orders.length>0,warning:orders.length?'Validar estados y líneas antes de importar':'Sin pedidos visibles: no demuestra ausencia de pedidos del proveedor'};
  }
}

export const normalizeName=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const tokens=value=>new Set(normalizeName(value).split(' ').filter(word=>word.length>1&&!['de','del','la','el','los','las','para','con','en'].includes(word)));
const similarity=(left,right)=>{const common=[...left].filter(word=>right.has(word)).length;return left.size+right.size?2*common/(left.size+right.size):0;};
export function proposeMatches(products,variants) {
  const byName=new Map();for(const variant of variants){const key=normalizeName(variant.name);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(variant);}
  return products.map(product=>{
    const linked=variants.filter(v=>v.external_codes?.some(c=>c.platform==='Dropi'&&String(c.code)===String(product.id)));
    const exact=byName.get(normalizeName(product.name))??[];
    const words=tokens(product.name);
    const suggested=linked.length||exact.length?[]:variants.map(v=>({...v,score:similarity(words,tokens(v.name))})).filter(v=>v.score>=0.65).sort((a,b)=>b.score-a.score).slice(0,3);
    const candidates=linked.length?linked:exact.length?exact:suggested;
    return {dropi_id:product.id,dropi_sku:product.sku,name:product.name,type:product.type,dropi_price:product.sale_price,published_stock:product.total_stock,status:linked.length===1?'existing_mapping':exact.length===1&&product.type==='SIMPLE'?'review_exact_name':exact.length?'review_variants':suggested.length?'review_similar_name':'unmatched',candidates:candidates.map(v=>({id:v.id,sku:v.sku??v.meibo_sku,name:v.name,attributes:v.attributes,score:v.score??1})),variation_ids:[...new Set((product.variation_warehouses??[]).map(v=>v.variation_id).filter(v=>v!=null))]};
  });
}
