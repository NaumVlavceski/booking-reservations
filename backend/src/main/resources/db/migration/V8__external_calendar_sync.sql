CREATE TABLE external_calendar
(
    id              UUID          NOT NULL,
    unit_id         UUID          NOT NULL,
    platform        VARCHAR(20)   NOT NULL,
    ics_url         VARCHAR(1000) NOT NULL,
    last_synced_at  TIMESTAMP WITHOUT TIME ZONE,
    last_success_at TIMESTAMP WITHOUT TIME ZONE,
    last_error      VARCHAR(1000),
    created_at      TIMESTAMP WITHOUT TIME ZONE,
    updated_at      TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT pk_external_calendar PRIMARY KEY (id),
    CONSTRAINT uc_external_calendar_unit_platform UNIQUE (unit_id, platform)
);

ALTER TABLE external_calendar
    ADD CONSTRAINT fk_external_calendar_on_unit FOREIGN KEY (unit_id) REFERENCES unit (id);

CREATE TABLE external_event
(
    id                   UUID         NOT NULL,
    external_calendar_id UUID         NOT NULL,
    uid                  VARCHAR(500) NOT NULL,
    reservation_id       UUID,
    raw_hash             VARCHAR(64)  NOT NULL,
    last_seen_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at           TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT pk_external_event PRIMARY KEY (id),
    CONSTRAINT uc_external_event_calendar_uid UNIQUE (external_calendar_id, uid)
);

ALTER TABLE external_event
    ADD CONSTRAINT fk_external_event_on_calendar FOREIGN KEY (external_calendar_id) REFERENCES external_calendar (id);

ALTER TABLE external_event
    ADD CONSTRAINT fk_external_event_on_reservation FOREIGN KEY (reservation_id) REFERENCES reservation (id);