ALTER TABLE app_user ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Everyone who registered before verification existed stays able to log in
UPDATE app_user SET email_verified_at = now() WHERE email_verified_at IS NULL;

CREATE TABLE email_verification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    code_hash   VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ
);
CREATE INDEX idx_email_verification_user_created ON email_verification (user_id, created_at DESC);
