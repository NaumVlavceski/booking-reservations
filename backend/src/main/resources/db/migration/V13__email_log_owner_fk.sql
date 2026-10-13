ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_owner_id_fkey;
ALTER TABLE email_log
    ADD CONSTRAINT email_log_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE SET NULL;