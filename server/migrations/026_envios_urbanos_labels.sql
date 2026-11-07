CREATE TABLE envios_urbanos_shipments (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 shipment_id TEXT NOT NULL UNIQUE,
 tracking_code TEXT NOT NULL,
 linked_at TEXT NOT NULL
);
