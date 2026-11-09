-- FRESH (EMPTY) DATABASES ONLY (see V1_1 in this folder). Puts back unit.base_price, which V6 drops.
ALTER TABLE unit ADD COLUMN IF NOT EXISTS base_price NUMERIC(10, 2) NOT NULL DEFAULT 0;
