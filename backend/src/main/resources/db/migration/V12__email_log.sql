CREATE TABLE email_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID REFERENCES app_user(id) ON DELETE SET NULL,
    to_address  VARCHAR(255) NOT NULL,
    type        VARCHAR(40)  NOT NULL,
    subject     VARCHAR(255) NOT NULL,
    status      VARCHAR(16)  NOT NULL,
    attempts    INT          NOT NULL DEFAULT 0,
    provider_id VARCHAR(100),
    error       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_log_owner_created ON email_log (owner_id, created_at DESC);