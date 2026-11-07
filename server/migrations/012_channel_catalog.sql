CREATE TABLE channel_listings (
 id TEXT PRIMARY KEY,
 platform TEXT NOT NULL CHECK(platform IN ('Dropi','Dropea','Evolut','Jumpseller')),
 product_ref TEXT NOT NULL,
 variant_ref TEXT NOT NULL DEFAULT '',
 external_sku TEXT NOT NULL DEFAULT '',
 name TEXT NOT NULL,
 attributes TEXT NOT NULL DEFAULT '',
 image_url TEXT NOT NULL DEFAULT '',
 price INTEGER,
 currency TEXT NOT NULL DEFAULT 'CLP',
 published_stock INTEGER,
 remote_status TEXT NOT NULL DEFAULT '',
 can_associate INTEGER NOT NULL DEFAULT 1,
 captured_at TEXT NOT NULL,
 variant_id TEXT REFERENCES variants(id),
 linked_at TEXT,
 linked_by TEXT REFERENCES users(id),
 evidence TEXT NOT NULL DEFAULT '',
 UNIQUE(platform,product_ref,variant_ref)
);
CREATE INDEX channel_listings_link ON channel_listings(variant_id,platform);
CREATE TABLE channel_link_events (id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES channel_listings(id),variant_id TEXT NOT NULL REFERENCES variants(id),actor_id TEXT NOT NULL REFERENCES users(id),evidence TEXT NOT NULL,created_at TEXT NOT NULL);
