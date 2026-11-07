CREATE TABLE sale_duplications (
 id TEXT PRIMARY KEY,
 source_sale_id TEXT NOT NULL REFERENCES sales(id),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 actor_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 completed_sale_id TEXT UNIQUE REFERENCES sales(id)
);
CREATE INDEX sale_duplications_source ON sale_duplications(source_sale_id);
