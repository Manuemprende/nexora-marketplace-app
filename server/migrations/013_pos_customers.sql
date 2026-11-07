CREATE TABLE IF NOT EXISTS pos_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rut TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  business TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS pos_customers_search ON pos_customers(name COLLATE NOCASE, rut COLLATE NOCASE);
