CREATE TABLE dropea_connections (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL DEFAULT 'CL',
  api_token_encrypted TEXT,
  hmac_secret_encrypted TEXT,
  base_url TEXT NOT NULL DEFAULT 'https://cl.public-api.dropea.com',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','error')),
  webhook_registered INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  actor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE dropea_webhooks (
  id TEXT PRIMARY KEY,
  event_id TEXT UNIQUE,
  topic TEXT NOT NULL,
  market TEXT,
  resource_id TEXT,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','failed','ignored'))
);

CREATE INDEX dropea_webhooks_status ON dropea_webhooks(status, received_at);
