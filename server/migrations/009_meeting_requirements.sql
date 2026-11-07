ALTER TABLE user_permissions ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'manage' CHECK(access_mode IN ('read','manage'));
CREATE TABLE variant_policies (variant_id TEXT PRIMARY KEY REFERENCES variants(id), low_threshold INTEGER NOT NULL DEFAULT 15 CHECK(low_threshold>=0), safety_stock INTEGER NOT NULL DEFAULT 0 CHECK(safety_stock>=0), target_stock INTEGER NOT NULL DEFAULT 0 CHECK(target_stock>=0));
CREATE TABLE platform_stock (code_id TEXT PRIMARY KEY REFERENCES external_codes(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK(quantity>=0), updated_at TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id));
CREATE TABLE platform_stock_events (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id), platform TEXT NOT NULL, before_qty INTEGER, after_qty INTEGER NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE received_returns (id TEXT PRIMARY KEY, source_type TEXT NOT NULL CHECK(source_type IN ('sale','order')), source_id TEXT NOT NULL, variant_id TEXT NOT NULL REFERENCES variants(id), quantity INTEGER NOT NULL CHECK(quantity>0), reason TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE business_settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);

ALTER TABLE sales ADD COLUMN customer_giro TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN customer_city TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN company_json TEXT NOT NULL DEFAULT '{}';
