ALTER TABLE order_items ADD COLUMN unit_price INTEGER CHECK(unit_price IS NULL OR unit_price >= 0);
UPDATE order_items SET unit_price=(SELECT si.price FROM sale_items si JOIN orders o ON o.sale_id=si.sale_id WHERE o.id=order_items.order_id AND si.variant_id=order_items.variant_id) WHERE order_id IN (SELECT id FROM orders WHERE stock_policy='deducted');
