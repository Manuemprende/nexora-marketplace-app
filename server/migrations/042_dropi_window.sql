ALTER TABLE external_order_previews ADD COLUMN source_date TEXT NOT NULL DEFAULT '';
UPDATE external_order_previews SET source_date=substr(json_extract(payload,'$.created_at'),1,10) WHERE platform='Dropi';
CREATE INDEX dropi_previews_date ON external_order_previews(platform,source_date,external_id);
CREATE TABLE dropi_order_window (
 external_id TEXT PRIMARY KEY,
 source_date TEXT NOT NULL,
 payload TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 detail_fingerprint TEXT,
 detail_at TEXT,
 attempted_at TEXT,
 last_error TEXT,
 observed_at TEXT NOT NULL
);
