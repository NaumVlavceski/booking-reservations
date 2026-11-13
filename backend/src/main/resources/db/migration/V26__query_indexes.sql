CREATE INDEX IF NOT EXISTS idx_reservation_owner_checkin   ON reservation (owner_id, lower(stay_range));
CREATE INDEX IF NOT EXISTS idx_reservation_unit            ON reservation (unit_id);
CREATE INDEX IF NOT EXISTS idx_reservation_owner_cancelled ON reservation (owner_id, cancelled_at DESC) WHERE status = 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_unit_ical_token             ON unit (ical_token);
CREATE INDEX IF NOT EXISTS idx_app_user_owner              ON app_user (owner_id);
CREATE INDEX IF NOT EXISTS idx_app_user_email_upper        ON app_user (upper(email));
CREATE INDEX IF NOT EXISTS idx_external_event_reservation  ON external_event (reservation_id);
