UPDATE products SET category='Ferreteria' WHERE category='543638' AND source_url='https://www.meibo.cl/adaptador-de-sierra-electrica-para-taladro';
CREATE TABLE categories (name TEXT PRIMARY KEY COLLATE NOCASE);
INSERT OR IGNORE INTO categories SELECT DISTINCT category FROM products WHERE category<>'';
ALTER TABLE variants ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE variants ADD COLUMN size TEXT NOT NULL DEFAULT '';
ALTER TABLE variants ADD COLUMN presentation TEXT NOT NULL DEFAULT '';
UPDATE variants SET presentation=attributes;
CREATE UNIQUE INDEX variant_options ON variants(product_id,lower(color),lower(size),lower(presentation)) WHERE color<>'' OR size<>'';
