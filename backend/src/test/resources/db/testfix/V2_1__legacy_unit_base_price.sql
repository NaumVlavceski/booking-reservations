-- TEST ONLY: reproduces the legacy unit.base_price column that V6 drops (see V1_1 note).
ALTER TABLE unit ADD COLUMN base_price NUMERIC(10, 2) NOT NULL DEFAULT 0;
