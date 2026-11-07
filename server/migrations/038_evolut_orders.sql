CREATE TABLE evolut_prepare_outbox (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), prepared_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','checking','sending','uncertain','confirmed','review')),
 message TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
