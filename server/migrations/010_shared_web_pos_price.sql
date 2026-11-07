-- Canonical price for Jumpseller and POS lives only in variants.price.
-- Retain existing explicit web assignments when upgrading; historical orders/sales are snapshots.
UPDATE variants SET price=(SELECT c.price FROM external_codes c WHERE c.variant_id=variants.id AND c.platform='Jumpseller') WHERE EXISTS (SELECT 1 FROM external_codes c WHERE c.variant_id=variants.id AND c.platform='Jumpseller' AND c.price IS NOT NULL);
UPDATE external_codes SET price=NULL WHERE platform='Jumpseller';
