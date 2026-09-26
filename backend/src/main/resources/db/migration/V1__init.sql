CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_user
(
    id            UUID                         NOT NULL,
    owner_id      UUID                         NOT NULL,
    email         VARCHAR(255)                 NOT NULL,
    password_hash VARCHAR(255)                 NOT NULL,
    full_name     VARCHAR(255),
    role          VARCHAR(255) DEFAULT 'OWNER' NOT NULL,
    active        BOOLEAN      DEFAULT TRUE    NOT NULL,
    last_login_at TIMESTAMP WITHOUT TIME ZONE,
    created_at    TIMESTAMP WITHOUT TIME ZONE,
    updated_at    TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT pk_appuser PRIMARY KEY (id)
);

CREATE TABLE owner
(
    id            UUID                                 NOT NULL,
    business_name VARCHAR(255)                         NOT NULL,
    contact_phone VARCHAR(255),
    timezone      VARCHAR(255) DEFAULT 'Europe/Skopje',
    active        BOOLEAN      DEFAULT TRUE            NOT NULL,
    created_at    TIMESTAMP WITHOUT TIME ZONE,
    updated_at    TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT pk_owner PRIMARY KEY (id)
);

ALTER TABLE app_user
    ADD CONSTRAINT uc_appuser_email UNIQUE (email);

ALTER TABLE app_user
    ADD CONSTRAINT FK_APPUSER_ON_OWNER FOREIGN KEY (owner_id) REFERENCES owner (id);