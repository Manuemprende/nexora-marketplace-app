import { randomUUID, randomBytes, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { fail, ApiError, text } from './service.mjs';

export const DROPEA_BASE_PATH = '/api/integrations/dropea';

function getTokenKey(env = process.env) {
  const hex = env.NEXORA_TOKEN_KEY || '';
  if (hex.length === 64) return Buffer.from(hex, 'hex');
  // Fallback predictable 32-byte key derived from a default salt if not set
  return Buffer.from('e4f9b2d83a1c7e5f90241b8a6d3c2e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d', 'hex');
}

export function encryptSecret(plainText, key = getTokenKey()) {
  if (!plainText) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}

export function decryptSecret(encrypted, key = getTokenKey()) {
  if (!encrypted) return null;
  const [iv, tag, data] = encrypted.split('.').map(p => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function getDropeaConfig(db, env = process.env) {
  let dbRow = null;
  try {
    dbRow = db?.prepare('SELECT * FROM dropea_connections WHERE id=?').get('main');
  } catch {
    // Table may not exist yet in early tests
  }

  const key = getTokenKey(env);
  const token = (dbRow?.api_token_encrypted ? decryptSecret(dbRow.api_token_encrypted, key) : null)
    || env.DROPEA_API_TOKEN
    || '';

  const hmacSecret = (dbRow?.hmac_secret_encrypted ? decryptSecret(dbRow.hmac_secret_encrypted, key) : null)
    || env.DROPEA_HMAC_SECRET
    || '';

  const baseUrl = dbRow?.base_url || env.DROPEA_BASE_URL || 'https://cl.public-api.dropea.com';
  const market = dbRow?.market || env.DROPEA_DEFAULT_MARKET || 'CL';

  return {
    configured: Boolean(token && token.length > 20),
    hasHmac: Boolean(hmacSecret && hmacSecret.length >= 8),
    token,
    hmacSecret,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    market,
    lastSyncAt: dbRow?.last_sync_at || null,
    webhookRegistered: Boolean(dbRow?.webhook_registered)
  };
}

export async function dropeaFetch(path, { method = 'GET', body, config, timeoutMs = 10000, idempotencyKey } = {}, fetcher = fetch) {
  const url = `${config.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${config.token}`
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  let response;
  try {
    response = await fetcher(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    return {
      ok: false,
      status: 504,
      error: `Timeout o fallo de conexión con Dropea: ${err.message}`
    };
  }

  let data = null;
  const rawText = await response.text();
  try {
    data = JSON.parse(rawText || '{}');
  } catch {
    data = { raw: rawText };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: !response.ok ? (data?.failure?.message || data?.error || `HTTP ${response.status}`) : null
  };
}

export function verifyDropeaHmac(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const cleanSig = signature.replace(/^sha256=/i, '').trim();
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');

  const sigBuf = Buffer.from(cleanSig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

export async function dropeaRoutes({ db, user, url, req, res, readBody }) {
  if (!url.pathname.startsWith(DROPEA_BASE_PATH)) return false;

  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // Webhook public endpoint is handled in dropea-notifications.mjs
  if (url.pathname === `${DROPEA_BASE_PATH}/webhook`) {
    return false;
  }

  // Admin access required for Dropea configuration and manual sync
  if (!user || user.role !== 'admin') {
    fail(403, 'Solo administradores pueden configurar Dropea');
  }

  const config = getDropeaConfig(db);

  if (url.pathname === `${DROPEA_BASE_PATH}/status` && req.method === 'GET') {
    const pendingWebhooks = db.prepare("SELECT COUNT(*) AS count FROM dropea_webhooks WHERE status='pending'").get()?.count || 0;
    const totalWebhooks = db.prepare("SELECT COUNT(*) AS count FROM dropea_webhooks").get()?.count || 0;

    send(200, {
      configured: config.configured,
      hasHmac: config.hasHmac,
      market: config.market,
      lastSyncAt: config.lastSyncAt,
      webhookRegistered: config.webhookRegistered,
      pendingWebhooks,
      totalWebhooks
    });
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/test` && req.method === 'POST') {
    if (!config.configured) {
      fail(400, 'Dropea no tiene token de API configurado.');
    }
    const result = await dropeaFetch('/dropshipper/me', { config });
    if (!result.ok) {
      send(200, {
        ok: false,
        status: result.status,
        message: `Dropea API respondió con estado ${result.status}: ${result.error}`,
        raw: result.data
      });
      return true;
    }
    send(200, {
      ok: true,
      status: 200,
      profile: result.data
    });
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/configure` && req.method === 'POST') {
    const input = await readBody(req);
    const token = input.token ? text(input.token, 'Token de API', 2000, true) : null;
    const hmacSecret = input.hmacSecret ? text(input.hmacSecret, 'HMAC Secret', 200, false) : null;
    const market = input.market ? text(input.market, 'Mercado', 10, true).toUpperCase() : config.market;
    const baseUrl = input.baseUrl ? text(input.baseUrl, 'URL Base', 200, true).replace(/\/+$/, '') : config.baseUrl;

    const key = getTokenKey();
    const tokenEncrypted = token ? encryptSecret(token, key) : null;
    const hmacEncrypted = hmacSecret ? encryptSecret(hmacSecret, key) : null;

    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO dropea_connections (id, market, api_token_encrypted, hmac_secret_encrypted, base_url, status, updated_at, created_at, actor_id)
      VALUES ('main', ?, ?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        market = excluded.market,
        api_token_encrypted = COALESCE(excluded.api_token_encrypted, dropea_connections.api_token_encrypted),
        hmac_secret_encrypted = COALESCE(excluded.hmac_secret_encrypted, dropea_connections.hmac_secret_encrypted),
        base_url = excluded.base_url,
        updated_at = excluded.updated_at,
        actor_id = excluded.actor_id
    `).run(market, tokenEncrypted, hmacEncrypted, baseUrl, nowIso, nowIso, user.id);

    send(200, { ok: true, message: 'Configuración de Dropea guardada correctamente' });
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/orders` && req.method === 'GET') {
    if (!config.configured) {
      const localWebhooks = db.prepare("SELECT * FROM dropea_webhooks WHERE topic LIKE 'order%' ORDER BY received_at DESC LIMIT 50").all();
      send(200, { ok: true, orders: [], webhooks: localWebhooks, configured: false });
      return true;
    }
    const result = await dropeaFetch('/dropshipper/orders?limit=50', { config });
    const localWebhooks = db.prepare("SELECT * FROM dropea_webhooks WHERE topic LIKE 'order%' ORDER BY received_at DESC LIMIT 50").all();
    const orderList = result.data?.data?.items || result.data?.data?.orders || result.data?.orders || result.data?.items || (Array.isArray(result.data?.data) ? result.data.data : Array.isArray(result.data) ? result.data : []);
    send(200, {
      ok: result.ok,
      orders: orderList,
      webhooks: localWebhooks,
      configured: true,
      error: result.error
    });
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/orders` && req.method === 'POST') {
    if (!config.configured) fail(400, 'Dropea no está configurado');
    const input = await readBody(req);
    const idempotencyKey = input.idempotency_key || randomUUID();
    const result = await dropeaFetch('/dropshipper/orders', {
      method: 'POST',
      body: input,
      config,
      idempotencyKey
    });
    send(result.ok ? 201 : 400, result);
    return true;
  }

  const confirmMatch = new RegExp(`^${DROPEA_BASE_PATH}/orders/([^/]+)/confirm$`).exec(url.pathname);
  if (confirmMatch && req.method === 'POST') {
    if (!config.configured) fail(400, 'Dropea no está configurado');
    const orderId = confirmMatch[1];
    const result = await dropeaFetch(`/dropshipper/orders/${orderId}/confirm`, {
      method: 'POST',
      config,
      idempotencyKey: randomUUID()
    });
    send(result.ok ? 200 : 400, result);
    return true;
  }

  const cancelMatch = new RegExp(`^${DROPEA_BASE_PATH}/orders/([^/]+)/cancel$`).exec(url.pathname);
  if (cancelMatch && req.method === 'POST') {
    if (!config.configured) fail(400, 'Dropea no está configurado');
    const orderId = cancelMatch[1];
    const input = await readBody(req);
    const result = await dropeaFetch(`/dropshipper/orders/${orderId}/cancel`, {
      method: 'POST',
      body: input,
      config,
      idempotencyKey: randomUUID()
    });
    send(result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/products` && req.method === 'GET') {
    if (!config.configured) {
      send(200, { ok: true, products: [], configured: false });
      return true;
    }
    const result = await dropeaFetch('/dropshipper/products?limit=50', { config });
    const productList = result.data?.data?.items || result.data?.products || result.data?.items || (Array.isArray(result.data?.data) ? result.data.data : Array.isArray(result.data) ? result.data : []);
    send(200, {
      ok: result.ok,
      products: productList,
      error: result.error
    });
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/shops` && req.method === 'GET') {
    if (!config.configured) {
      send(200, { ok: true, shops: [] });
      return true;
    }
    const result = await dropeaFetch('/dropshipper/shops', { config });
    const shopList = result.data?.data?.shops || result.data?.data?.items || result.data?.shops || result.data?.items || (Array.isArray(result.data?.data) ? result.data.data : Array.isArray(result.data) ? result.data : []);
    send(200, {
      ok: result.ok,
      shops: shopList,
      error: result.error
    });
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/webhooks` && req.method === 'GET') {
    const list = db.prepare("SELECT * FROM dropea_webhooks ORDER BY received_at DESC LIMIT 50").all();
    send(200, { ok: true, webhooks: list });
    return true;
  }

  if (url.pathname === `${DROPEA_BASE_PATH}/webhooks/register` && req.method === 'POST') {
    if (!config.configured) fail(400, 'Dropea no está configurado');
    const origin = process.env.NEXORA_PUBLIC_ORIGIN?.split(',')[0] || 'https://nexora.wentixai.cyou';
    const targetUrl = `${origin}${DROPEA_BASE_PATH}/webhook`;
    const payload = {
      target_url: targetUrl,
      events: ['order.created', 'order.status.changed', 'order.cancelled', 'issue.created', 'issue.resolved']
    };
    const result = await dropeaFetch('/dropshipper/webhooks', {
      method: 'POST',
      body: payload,
      config,
      idempotencyKey: randomUUID()
    });
    if (result.ok) {
      db.prepare("UPDATE dropea_connections SET webhook_registered=1 WHERE id='main'").run();
    }
    send(result.ok ? 200 : 400, { ...result, targetUrl });
    return true;
  }

  fail(404, 'Ruta de Dropea no encontrada');
}
