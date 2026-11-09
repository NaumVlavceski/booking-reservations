-- FRESH (EMPTY) DATABASES ONLY. Never add this folder to Flyway's locations on a database that already exists.
-- V1 was edited after it had been applied, so a from-scratch run lacks owner.contact_email, which V5 alters
-- (and V14 later drops). This puts the column back so V5 can run. Enable it with
--   SPRING_FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/fresh-install
-- On an existing database Flyway refuses to start ("resolved migration not applied"), so nothing changes there.
ALTER TABLE owner ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255) NOT NULL DEFAULT '';
