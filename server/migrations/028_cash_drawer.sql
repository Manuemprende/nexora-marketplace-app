CREATE TABLE cash_sessions (
 id TEXT PRIMARY KEY,
 number INTEGER NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('open','closed')),
 opening_balance INTEGER NOT NULL CHECK(opening_balance>=0),
 opened_by TEXT NOT NULL REFERENCES users(id),
 opened_at TEXT NOT NULL,
 closed_by TEXT REFERENCES users(id),
 closed_at TEXT,
 counted_cash INTEGER,
 expected_cash INTEGER,
 difference INTEGER,
 closing_note TEXT NOT NULL DEFAULT '',
 closing_summary TEXT
);
CREATE UNIQUE INDEX cash_one_open ON cash_sessions(status) WHERE status='open';
CREATE TABLE cash_refunds (
 id TEXT PRIMARY KEY,
 sale_id TEXT NOT NULL REFERENCES sales(id),
 session_id TEXT REFERENCES cash_sessions(id),
 amount INTEGER NOT NULL CHECK(amount>0),
 method TEXT NOT NULL CHECK(method IN ('cash','card','transfer')),
 reason TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL
);
CREATE TABLE cash_movements (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES cash_sessions(id),
 kind TEXT NOT NULL CHECK(kind IN ('sale_receipt','sale_change','refund','entry','withdrawal')),
 amount INTEGER NOT NULL,
 sale_id TEXT REFERENCES sales(id),
 refund_id TEXT UNIQUE REFERENCES cash_refunds(id),
 reason TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX cash_sale_once ON cash_movements(sale_id,kind) WHERE kind IN ('sale_receipt','sale_change');
CREATE INDEX cash_movements_session ON cash_movements(session_id,created_at);
CREATE INDEX cash_refunds_sale ON cash_refunds(sale_id);
ALTER TABLE sales ADD COLUMN cash_session_id TEXT REFERENCES cash_sessions(id);
ALTER TABLE sales ADD COLUMN cash_received INTEGER;
ALTER TABLE sales ADD COLUMN cash_change INTEGER;
ALTER TABLE sales ADD COLUMN cancellation_refund_method TEXT;
ALTER TABLE sales ADD COLUMN cancellation_refund_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN cash_controlled INTEGER NOT NULL DEFAULT 0;
