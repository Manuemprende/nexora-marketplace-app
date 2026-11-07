CREATE TABLE dropi_oauth_attempts (
 state_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 session_hash TEXT NOT NULL,
 browser_hash TEXT NOT NULL,
 verifier TEXT NOT NULL,
 redirect_uri TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 consumed_at TEXT,
 result TEXT NOT NULL DEFAULT 'pending'
);
