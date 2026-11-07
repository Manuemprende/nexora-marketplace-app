CREATE TABLE walmart_publication_feeds (
 feed_id TEXT PRIMARY KEY,
 variant_id TEXT NOT NULL REFERENCES variants(id),
 sku TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'RECEIVED',
 message TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 checked_at TEXT,
 request_json TEXT NOT NULL
);
