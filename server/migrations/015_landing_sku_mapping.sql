ALTER TABLE landings ADD COLUMN master_sku TEXT DEFAULT '';
ALTER TABLE landings ADD COLUMN supplier_platform TEXT DEFAULT 'Dropea';
ALTER TABLE landings ADD COLUMN supplier_product_id TEXT DEFAULT '';

ALTER TABLE landing_orders ADD COLUMN master_sku TEXT;
ALTER TABLE landing_orders ADD COLUMN supplier_platform TEXT;
ALTER TABLE landing_orders ADD COLUMN supplier_product_id TEXT;
ALTER TABLE landing_orders ADD COLUMN supplier_order_id TEXT;
ALTER TABLE landing_orders ADD COLUMN guide_number TEXT;
ALTER TABLE landing_orders ADD COLUMN tracking_url TEXT;

-- Update or insert seed landings with SKU Maestro & Proveedor
INSERT OR IGNORE INTO landings (id, name, url, master_sku, supplier_platform, supplier_product_id, auto_fulfillment, created_at)
VALUES 
  ('aerosleep', 'AeroSleep™ Bandas Nasales', 'https://aerosleep.pidedirecto.cyou', 'AERO-MAG-01', 'Dropea', '10482', 'dropea', datetime('now')),
  ('flexwalk', 'FlexWalk™ Plantillas 4D Ortopédicas', 'https://flexwalk.pidedirecto.cyou', 'FLEX-4D-02', 'Dropi', '5541', 'dropi', datetime('now')),
  ('neocell', 'NeoCell™ Sérum Antiarrugas', 'https://neocell.pidedirecto.cyou', 'NEO-COL-03', 'Dropea', '8820', 'dropea', datetime('now'));

UPDATE landings SET 
  master_sku = 'AERO-MAG-01', 
  supplier_platform = 'Dropea', 
  supplier_product_id = '10482' 
WHERE id = 'aerosleep';
