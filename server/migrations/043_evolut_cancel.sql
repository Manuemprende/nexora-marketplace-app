CREATE TABLE evolut_cancel_outbox (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 prepared_at TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','checking','sending','uncertain','confirmed','review')),
 message TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
