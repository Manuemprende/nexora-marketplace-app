CREATE TABLE external_codes_walmart (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id), platform TEXT NOT NULL, code TEXT NOT NULL COLLATE NOCASE, origin TEXT NOT NULL, created_at TEXT NOT NULL, price INTEGER CHECK(price IS NULL OR price>=0), UNIQUE(platform,code), UNIQUE(variant_id,platform));
INSERT INTO external_codes_walmart SELECT * FROM external_codes;
DROP TABLE external_codes;
ALTER TABLE external_codes_walmart RENAME TO external_codes;
CREATE INDEX codes_lookup ON external_codes(code);
CREATE TABLE channel_listings_walmart (
 id TEXT PRIMARY KEY,
 platform TEXT NOT NULL,
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
INSERT INTO channel_listings_walmart SELECT * FROM channel_listings;
DROP TABLE channel_listings;
ALTER TABLE channel_listings_walmart RENAME TO channel_listings;
CREATE INDEX channel_listings_link ON channel_listings(variant_id,platform);
