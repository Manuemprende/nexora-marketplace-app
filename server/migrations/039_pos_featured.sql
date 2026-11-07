CREATE TABLE pos_featured (
 slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 4),
 variant_id TEXT NOT NULL UNIQUE REFERENCES variants(id)
);
