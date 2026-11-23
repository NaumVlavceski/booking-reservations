-- Admin panel, Batch A: start collecting data that cannot be backfilled later, and the tables the panel uses.
-- Additive only: new tables, nullable or defaulted columns, indexes. Nothing here changes what owners see.

-- A1. When the owner last used the app (written at most every ~10 minutes, see LastSeenTracker).
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- A4. Admin flag: set by hand in the database only; no code path writes it.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS admin_stepup_failed_attempts INT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS admin_stepup_locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_app_user_email_lower ON app_user (lower(email));
CREATE INDEX IF NOT EXISTS idx_app_user_created_at  ON app_user (created_at);
CREATE INDEX IF NOT EXISTS idx_app_user_last_seen   ON app_user (last_seen_at);

-- A2. email_log (V12) grows: body for admin-written messages only, who sent it, when the provider last reported on it.
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS sent_by_admin_id UUID REFERENCES app_user (id) ON DELETE SET NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_log_status_created ON email_log (status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_to_lower       ON email_log (lower(to_address));
-- Resend webhook updates look rows up by the provider's message id
CREATE INDEX IF NOT EXISTS idx_email_log_provider_id    ON email_log (provider_id);

-- A3. Calendar sync tracking for support. last_synced_at is the last attempt, last_success_at and
-- consecutive_failures already exist; last_error stays the owner-facing text.
ALTER TABLE external_calendar ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
ALTER TABLE external_calendar ADD COLUMN IF NOT EXISTS last_error_message VARCHAR(300);

-- A4. The admin's private reminders about an owner. Go with the owner's account.
CREATE TABLE IF NOT EXISTS admin_note (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id      UUID          NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    text               VARCHAR(4000) NOT NULL,
    remind_on          DATE,
    done_at            TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES app_user (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_note_owner_created ON admin_note (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_note_remind_open   ON admin_note (remind_on) WHERE done_at IS NULL;

-- A4. Append-only record of admin actions. No foreign keys, so entries outlive a deleted owner. details holds ids
-- and counts only. Only the retention job (APP_AUDIT_RETENTION_DAYS) deletes rows.
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id  UUID,
    action         VARCHAR(60)  NOT NULL,
    target_user_id UUID,
    details        JSONB,
    ip             VARCHAR(64),
    user_agent     VARCHAR(200),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target  ON admin_audit_log (target_user_id, created_at DESC);

-- A4. Emailed admin step-up codes. Separate from email_verification so a code can only ever serve its own purpose.
CREATE TABLE IF NOT EXISTS admin_stepup_code (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    code_hash   VARCHAR(64) NOT NULL,
    purpose     VARCHAR(30) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts    INT         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_stepup_user_created ON admin_stepup_code (user_id, created_at DESC);
