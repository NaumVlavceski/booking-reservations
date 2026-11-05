-- Marks the public demo owner (app.demo.*). The nightly demo reset only ever touches an owner with demo = true,
-- so a real account can never be reset, even if APP_DEMO_EMAIL were set to its address. Every existing owner is false.
ALTER TABLE owner ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT FALSE;
