CREATE TABLE jumpseller_prepared_outbox (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES orders(id),
 external_id TEXT NOT NULL,
 prepared_at TEXT NOT NULL,
 target_status TEXT,
 status TEXT NOT NULL CHECK(status IN ('disabled','queued','checking','sending','uncertain','confirmed','review','skipped')),
 message TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(order_id,prepared_at)
);
