import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const uuid = randomUUID;
export const now = () => new Date().toISOString();
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, hash = '') {
  const [salt, encoded] = String(hash).split(':');
  if (!salt || !encoded) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function openDatabase(path, { seedDemoData = false } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const migrations = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort()) {
    if (!db.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name)) {
      const rebuild = name === '023_walmart_channels.sql' || name === '011_pos_discounts_customers.sql';
      if (rebuild) db.exec('PRAGMA foreign_keys=OFF');
      try {
        transaction(db, () => {
          db.exec(readFileSync(new URL(name, migrations), 'utf8'));
          db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name, now());
        });
      } finally {
        if (rebuild) db.exec('PRAGMA foreign_keys=ON');
      }
    }
  }
  const salesCols = new Set(db.prepare('PRAGMA table_info(sales)').all().map(c => c.name));
  if (!salesCols.has('customer_id')) {
    db.exec('ALTER TABLE sales ADD COLUMN customer_id TEXT REFERENCES customers(id)');
  }
  const custCols = new Set(db.prepare('PRAGMA table_info(customers)').all().map(c => c.name));
  if (custCols.size > 0 && !custCols.has('phone')) {
    db.exec("ALTER TABLE customers ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  }
  const hasPosCustomers = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pos_customers'").get();
  if (hasPosCustomers) {
    const posCustCols = new Set(db.prepare('PRAGMA table_info(pos_customers)').all().map(c => c.name));
    if (!posCustCols.has('phone')) {
      db.exec("ALTER TABLE pos_customers ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
    }
    if (!posCustCols.has('business')) {
      db.exec("ALTER TABLE pos_customers ADD COLUMN business TEXT NOT NULL DEFAULT ''");
    }
    db.exec(`
      INSERT OR IGNORE INTO customers(id,name,rut,address,giro,city,email,phone,created_at,actor_id)
      SELECT id,name,rut,address,business,city,email,phone,created_at,actor_id FROM pos_customers;
      INSERT OR IGNORE INTO pos_customers(id,name,rut,address,business,city,email,phone,created_at,actor_id)
      SELECT id,name,rut,address,giro,city,email,COALESCE(phone,''),created_at,actor_id FROM customers;
      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_ins AFTER INSERT ON customers BEGIN
        INSERT OR REPLACE INTO pos_customers(id,name,rut,address,business,city,email,phone,created_at,actor_id)
        VALUES (NEW.id,NEW.name,NEW.rut,NEW.address,NEW.giro,NEW.city,NEW.email,COALESCE(NEW.phone,''),NEW.created_at,NEW.actor_id);
      END;
      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_upd AFTER UPDATE ON customers BEGIN
        INSERT OR REPLACE INTO pos_customers(id,name,rut,address,business,city,email,phone,created_at,actor_id)
        VALUES (NEW.id,NEW.name,NEW.rut,NEW.address,NEW.giro,NEW.city,NEW.email,COALESCE(NEW.phone,''),NEW.created_at,NEW.actor_id);
      END;
    `);
  }
  return db;
}
