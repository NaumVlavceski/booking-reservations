CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reservation
(
    id           UUID           NOT NULL,
    unit_id      UUID           NOT NULL,
    owner_id     UUID           NOT NULL,
    stay_range   DATERANGE      NOT NULL,
    status       VARCHAR(255)   NOT NULL DEFAULT 'CONFIRMED',
    source       VARCHAR(255)   NOT NULL DEFAULT 'DIRECT',
    guest_name   VARCHAR(255)   NOT NULL,
    guest_email  VARCHAR(255),
    guest_phone  VARCHAR(255),
    guest_count  INTEGER        NOT NULL DEFAULT 1,
    nightly_rate DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    currency     VARCHAR(3)     NOT NULL DEFAULT 'EUR',
    notes        VARCHAR(255),
    created_at   TIMESTAMP WITHOUT TIME ZONE,
    updated_at   TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT pk_reservation PRIMARY KEY (id)
);

ALTER TABLE reservation
    ADD CONSTRAINT fk_reservation_on_unit FOREIGN KEY (unit_id) REFERENCES unit (id);

ALTER TABLE reservation
    ADD CONSTRAINT fk_reservation_on_owner FOREIGN KEY (owner_id) REFERENCES owner (id);

ALTER TABLE reservation
    ADD CONSTRAINT no_overlap
    EXCLUDE USING gist (unit_id WITH =, stay_range WITH &&)
    WHERE (status <> 'CANCELLED');