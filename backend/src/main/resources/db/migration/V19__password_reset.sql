-- One "forgot password" attempt: an emailed code, then (once the code is right) a short-lived reset token.
-- Only keyed/SHA-256 hashes are stored, never the code or the token.
CREATE TABLE IF NOT EXISTS password_reset (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    code_hash              VARCHAR(64) NOT NULL,
    code_expires_at        TIMESTAMPTZ NOT NULL,
    attempts               INT         NOT NULL DEFAULT 0,
    reset_token_hash       VARCHAR(64),
    reset_token_expires_at TIMESTAMPTZ,
    used_at                TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user_created ON password_reset (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_token_hash ON password_reset (reset_token_hash);
