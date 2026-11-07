CREATE TABLE mercadolibre_oauth_states (
 state_hash TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id),
 verifier TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE mercadolibre_connections (
 seller_id TEXT PRIMARY KEY,
 nickname TEXT NOT NULL,
 site_id TEXT NOT NULL,
 tokens_encrypted TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL
);
