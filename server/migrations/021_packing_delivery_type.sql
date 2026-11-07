ALTER TABLE orders ADD COLUMN packing_delivery_type TEXT CHECK(packing_delivery_type IN ('pickup','regional','delivery'));
