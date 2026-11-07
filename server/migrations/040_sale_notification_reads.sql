CREATE TABLE sale_notification_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), started_at TEXT NOT NULL
);
INSERT INTO sale_notification_settings VALUES (1,strftime('%Y-%m-%dT00:00:00.000Z','now'));
CREATE TABLE sale_notification_reads (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
 read_at TEXT NOT NULL,
 PRIMARY KEY(user_id,sale_id)
);
CREATE INDEX IF NOT EXISTS sales_notification_created ON sales(created_at);
