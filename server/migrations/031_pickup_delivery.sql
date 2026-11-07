ALTER TABLE orders ADD COLUMN pickup_delivered_at TEXT;
ALTER TABLE orders ADD COLUMN pickup_delivered_by TEXT REFERENCES users(id);
