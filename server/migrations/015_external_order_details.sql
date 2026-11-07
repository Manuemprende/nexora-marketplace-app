CREATE TABLE external_order_details (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 platform TEXT NOT NULL,
 external_id TEXT NOT NULL,
 payload TEXT NOT NULL,
 captured_at TEXT NOT NULL,
 UNIQUE(platform,external_id)
);
CREATE TABLE order_shipping_labels (
 fulfillment_id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES orders(id),
 content BLOB NOT NULL,
 captured_at TEXT NOT NULL
);
