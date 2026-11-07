CREATE TABLE channel_master_origins (
 variant_id TEXT PRIMARY KEY REFERENCES variants(id),
 listing_id TEXT NOT NULL UNIQUE REFERENCES channel_listings(id),
 created_at TEXT NOT NULL,
 merged_into TEXT REFERENCES variants(id)
);
CREATE TABLE channel_master_events (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL REFERENCES variants(id),
 target_id TEXT NOT NULL REFERENCES variants(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 evidence TEXT NOT NULL,
 created_at TEXT NOT NULL
);
