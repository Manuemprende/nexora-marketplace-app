import { createHash, randomUUID } from 'node:crypto';
import { fail } from './service.mjs';
import { verifyDropeaHmac, getDropeaConfig } from './dropea.mjs';

export const dropeaWebhookPath = '/api/integrations/dropea/webhook';

export function receiveDropeaWebhook(db, rawBody, headers, config = getDropeaConfig(db)) {
  const signature = headers['x-dropea-signature']
    || headers['x-hub-signature-256']
    || headers['x-signature']
    || '';

  // If Dropea HMAC secret is configured and signature header is sent, verify it
  if (config.hasHmac && signature) {
    const valid = verifyDropeaHmac(rawBody, signature, config.hmacSecret);
    if (!valid) {
      fail(401, 'Firma HMAC de Dropea inválida');
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    fail(400, 'Payload JSON inválido');
  }

  const eventId = String(headers['x-dropea-event-id'] || payload.event_id || payload.id || createHash('sha256').update(rawBody).digest('hex'));
  const topic = String(payload.topic || payload.event || 'unknown');
  const market = String(payload.market || config.market || 'CL');
  const resourceId = String(payload.resource_id || payload.order_id || payload.data?.id || '');

  // Check deduplication
  const existing = db.prepare('SELECT id FROM dropea_webhooks WHERE event_id=?').get(eventId);
  if (existing) {
    return { accepted: true, deduplicated: true, event_id: eventId };
  }

  // Queue limits
  const pendingCount = db.prepare("SELECT count(*) AS n FROM dropea_webhooks WHERE status='pending'").get()?.n || 0;
  if (pendingCount >= 10000) {
    fail(503, 'Cola de webhooks de Dropea saturada');
  }

  const webhookId = randomUUID();
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO dropea_webhooks (id, event_id, topic, market, resource_id, payload, received_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'processed')
  `).run(webhookId, eventId, topic, market, resourceId, JSON.stringify(payload), nowIso);

  return { accepted: true, event_id: eventId };
}
