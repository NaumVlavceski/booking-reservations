CREATE TABLE sync_conflict (
                               id                         UUID NOT NULL,
                               owner_id                   UUID NOT NULL,
                               unit_id                    UUID NOT NULL,
                               external_calendar_id       UUID NOT NULL,
                               external_uid               VARCHAR(500) NOT NULL,
                               platform                   VARCHAR(20) NOT NULL,
                               incoming_start             DATE NOT NULL,
                               incoming_end               DATE NOT NULL,
                               incoming_summary           VARCHAR(500),
                               conflicting_reservation_id UUID,
                               kind                       VARCHAR(20) NOT NULL,
                               status                     VARCHAR(20) NOT NULL,
                               resolved_at                TIMESTAMP WITHOUT TIME ZONE,
                               created_at                 TIMESTAMP WITHOUT TIME ZONE,
                               updated_at                 TIMESTAMP WITHOUT TIME ZONE,
                               CONSTRAINT pk_sync_conflict PRIMARY KEY (id),
                               CONSTRAINT uc_sync_conflict_event UNIQUE (external_calendar_id, external_uid),
                               CONSTRAINT fk_sync_conflict_owner FOREIGN KEY (owner_id) REFERENCES owner (id),
                               CONSTRAINT fk_sync_conflict_unit FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE,
                               CONSTRAINT fk_sync_conflict_calendar FOREIGN KEY (external_calendar_id)
                                   REFERENCES external_calendar (id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_conflict_owner_status ON sync_conflict (owner_id, status);

ALTER TABLE external_calendar DROP CONSTRAINT fk_external_calendar_on_unit;
ALTER TABLE external_calendar ADD CONSTRAINT fk_external_calendar_on_unit
    FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE;

ALTER TABLE external_event DROP CONSTRAINT fk_external_event_on_calendar;
ALTER TABLE external_event ADD CONSTRAINT fk_external_event_on_calendar
    FOREIGN KEY (external_calendar_id) REFERENCES external_calendar (id) ON DELETE CASCADE;

ALTER TABLE external_event DROP CONSTRAINT fk_external_event_on_reservation;
ALTER TABLE external_event ADD CONSTRAINT fk_external_event_on_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservation (id) ON DELETE SET NULL;