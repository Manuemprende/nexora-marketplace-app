CREATE TABLE publication_media(id TEXT PRIMARY KEY,image_id TEXT NOT NULL UNIQUE REFERENCES product_images(id),created_at TEXT NOT NULL);
