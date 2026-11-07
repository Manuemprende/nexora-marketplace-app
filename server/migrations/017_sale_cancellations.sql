ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','cancelled'));
ALTER TABLE sales ADD COLUMN cancellation_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN cancelled_at TEXT;
ALTER TABLE sales ADD COLUMN cancelled_by TEXT REFERENCES users(id);
CREATE INDEX sales_status_date ON sales(status,created_at);
