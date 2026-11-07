ALTER TABLE walmart_publication_feeds ADD COLUMN initial_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE walmart_publication_feeds ADD COLUMN stock_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE walmart_publication_feeds ADD COLUMN stock_message TEXT NOT NULL DEFAULT '';
