ALTER TABLE orders ADD COLUMN preparation_started_at TEXT;
ALTER TABLE orders ADD COLUMN inventory_allocated INTEGER NOT NULL DEFAULT 1 CHECK(inventory_allocated IN (0,1));
