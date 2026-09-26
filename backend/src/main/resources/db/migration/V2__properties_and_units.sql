CREATE TABLE property
(
    id         UUID                                 NOT NULL,
    owner_id   UUID                                 NOT NULL,
    name       VARCHAR(255)                         NOT NULL,
    address    VARCHAR(255),
    timezone   VARCHAR(255) DEFAULT 'Europe/Skopje',
    created_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT pk_property PRIMARY KEY (id)
);
CREATE TABLE unit
(
    id          UUID           NOT NULL,
    property_id UUID           NOT NULL,
    owner_id    UUID           NOT NULL,
    name        VARCHAR(255)   NOT NULL,
    capacity    INTEGER        NOT NULL,
    created_at  TIMESTAMP WITHOUT TIME ZONE,
    updated_at  TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT pk_unit PRIMARY KEY (id)
);

ALTER TABLE property
    ADD CONSTRAINT FK_PROPERTY_ON_OWNER FOREIGN KEY (owner_id) REFERENCES owner (id);

ALTER TABLE unit
    ADD CONSTRAINT FK_UNIT_ON_PROPERTY FOREIGN KEY (property_id) REFERENCES property (id);

ALTER TABLE unit
    ADD CONSTRAINT FK_UNIT_ON_OWNER FOREIGN KEY (owner_id) REFERENCES owner (id);