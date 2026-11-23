-- Admin panel, Batch B. Additive only.

-- A server-side admin session, opened by the emailed step-up code. Only a SHA-256 of the session token is stored.
-- Bound to the owner session's token_version: an owner logout, password change or reset ends it.
CREATE TABLE IF NOT EXISTS admin_session (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    token_version   INT         NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    max_expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admin_session_user ON admin_session (user_id, created_at DESC);

-- The admin's owner list counts properties and rooms per owner with grouped queries
CREATE INDEX IF NOT EXISTS idx_property_owner ON property (owner_id);
CREATE INDEX IF NOT EXISTS idx_unit_owner     ON unit (owner_id);
-- Audit entries by admin and action (step-up lock: wrong codes in the last 15 minutes)
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_action ON admin_audit_log (admin_user_id, action, created_at DESC);
