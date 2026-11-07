CREATE TABLE packing_support_requests (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES orders(id),
 item_id TEXT NOT NULL REFERENCES order_items(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 reason TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','in_progress','delivered','not_found','resolved','cancelled')),
 requested_by TEXT NOT NULL REFERENCES users(id),
 assigned_to TEXT REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX packing_support_active_item ON packing_support_requests(item_id) WHERE status NOT IN ('resolved','cancelled');
CREATE TABLE packing_support_events (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES packing_support_requests(id),
 action TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL
);
