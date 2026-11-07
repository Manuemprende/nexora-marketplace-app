ALTER TABLE external_codes ADD COLUMN price INTEGER CHECK(price IS NULL OR price >= 0);
