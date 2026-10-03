ALTER TABLE external_calendar
ALTER COLUMN last_synced_at TYPE TIMESTAMPTZ USING last_synced_at AT TIME ZONE 'UTC';
ALTER TABLE external_calendar
ALTER COLUMN last_success_at TYPE TIMESTAMPTZ USING last_success_at AT TIME ZONE 'UTC';
ALTER TABLE external_calendar
    ADD COLUMN consecutive_failures INT NOT NULL DEFAULT 0;