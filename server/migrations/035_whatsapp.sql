CREATE TABLE whatsapp_connection(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,sender_jid TEXT NOT NULL DEFAULT '',connected_at TEXT,last_error TEXT NOT NULL DEFAULT '');
INSERT INTO whatsapp_connection(id) VALUES (1);
CREATE TABLE whatsapp_auth(name TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE whatsapp_outbox(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),phone TEXT NOT NULL,sender_jid TEXT NOT NULL,document_hash TEXT NOT NULL,document BLOB NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','sending','sent','delivered','read','failed','uncertain','cancelled')),remote_id TEXT UNIQUE,error TEXT NOT NULL DEFAULT '',actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(sale_id,phone,document_hash));
CREATE INDEX whatsapp_outbox_sale ON whatsapp_outbox(sale_id,created_at);
