CREATE TABLE order_sync_state (platform TEXT PRIMARY KEY, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, summary TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '');
CREATE TABLE order_sync_inbox (
 platform TEXT NOT NULL, external_id TEXT NOT NULL, status TEXT NOT NULL,
 local_id TEXT REFERENCES orders(id), payload TEXT NOT NULL, error TEXT NOT NULL DEFAULT '',
 first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(platform,external_id)
);
