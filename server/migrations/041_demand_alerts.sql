CREATE TABLE demand_alert_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 window_days INTEGER NOT NULL DEFAULT 7 CHECK(window_days IN (7,14,30)),
 minimum_units INTEGER NOT NULL DEFAULT 20 CHECK(minimum_units>=1 AND minimum_units<=1000000),
 growth_percent INTEGER NOT NULL DEFAULT 30 CHECK(growth_percent>=1 AND growth_percent<=10000),
 updated_at TEXT NOT NULL,
 updated_by TEXT REFERENCES users(id)
);
INSERT INTO demand_alert_settings(id,updated_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
