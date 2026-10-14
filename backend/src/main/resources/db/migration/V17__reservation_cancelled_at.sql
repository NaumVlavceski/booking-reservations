ALTER TABLE reservation ADD COLUMN cancelled_at TIMESTAMPTZ;

UPDATE reservation SET cancelled_at = updated_at WHERE status = 'CANCELLED';
