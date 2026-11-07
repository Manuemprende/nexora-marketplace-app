CREATE TABLE mercadolibre_notifications (
 id TEXT PRIMARY KEY,
 seller_id TEXT NOT NULL REFERENCES mercadolibre_connections(seller_id),
 topic TEXT NOT NULL,
 resource TEXT NOT NULL,
 payload TEXT NOT NULL,
 received_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','failed'))
);
CREATE INDEX mercadolibre_notifications_status ON mercadolibre_notifications(status,received_at);
