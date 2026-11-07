CREATE TABLE IF NOT EXISTS landings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  auto_fulfillment TEXT DEFAULT 'none',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS landing_visits (
  id TEXT PRIMARY KEY,
  landing_id TEXT NOT NULL REFERENCES landings(id),
  visitor_id TEXT NOT NULL,
  last_ping TEXT NOT NULL,
  date TEXT NOT NULL,
  utm_source TEXT,
  utm_campaign TEXT
);

CREATE INDEX IF NOT EXISTS idx_landing_visits_lookup ON landing_visits(landing_id, date);
CREATE INDEX IF NOT EXISTS idx_landing_visits_ping ON landing_visits(landing_id, last_ping);
CREATE INDEX IF NOT EXISTS idx_landing_visits_unique ON landing_visits(landing_id, date, visitor_id);

CREATE TABLE IF NOT EXISTS landing_orders (
  id TEXT PRIMARY KEY,
  landing_id TEXT NOT NULL REFERENCES landings(id),
  order_id TEXT REFERENCES orders(id),
  order_number INTEGER,
  product_name TEXT NOT NULL,
  pack_selected TEXT NOT NULL,
  total_price INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_commune TEXT NOT NULL,
  customer_region TEXT NOT NULL,
  utm_source TEXT,
  utm_campaign TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  dropea_status TEXT,
  dropi_status TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_landing_orders_landing ON landing_orders(landing_id, created_at);

INSERT OR IGNORE INTO landings (id, name, url, auto_fulfillment, created_at)
VALUES ('aerosleep', 'AeroSleep™ Bandas Nasales', 'https://pidedirecto.cyou/aerosleep', 'none', datetime('now'));
