CREATE TABLE envios_urbanos_webhook_events (
 id TEXT PRIMARY KEY,
 body_hash TEXT NOT NULL UNIQUE,
 event_type TEXT NOT NULL,
 shipment_id TEXT NOT NULL DEFAULT '',
 payload TEXT NOT NULL,
 received_at TEXT NOT NULL,
 processed_at TEXT,
 status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 error TEXT NOT NULL DEFAULT '',
 order_id TEXT REFERENCES orders(id)
);
CREATE INDEX envios_urbanos_webhook_due ON envios_urbanos_webhook_events(status,next_attempt_at);
