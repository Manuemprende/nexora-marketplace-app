ALTER TABLE external_codes RENAME TO external_codes_old;
CREATE TABLE external_codes (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id),
  platform TEXT NOT NULL,
  code TEXT NOT NULL COLLATE NOCASE,
  origin TEXT NOT NULL,
  created_at TEXT NOT NULL,
  price INTEGER CHECK(price IS NULL OR price >= 0),
  UNIQUE(platform,code),
  UNIQUE(variant_id,platform)
);
INSERT INTO external_codes (id, variant_id, platform, code, origin, created_at, price)
  SELECT id, variant_id, platform, code, origin, created_at, price FROM external_codes_old;
DROP TABLE external_codes_old;
CREATE INDEX codes_lookup ON external_codes(code);
