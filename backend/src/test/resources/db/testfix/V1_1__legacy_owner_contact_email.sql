-- TEST ONLY: reproduces the legacy owner.contact_email column that real databases have
-- (V1 was edited after being applied, so a from-scratch migration lacks it but V5 expects it).
ALTER TABLE owner ADD COLUMN contact_email VARCHAR(255) NOT NULL DEFAULT '';
