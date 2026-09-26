ALTER TABLE unit DROP CONSTRAINT fk_unit_on_property;
ALTER TABLE unit
    ADD CONSTRAINT fk_unit_on_property FOREIGN KEY (property_id) REFERENCES property (id) ON DELETE CASCADE;

ALTER TABLE reservation DROP CONSTRAINT fk_reservation_on_unit;
ALTER TABLE reservation
    ADD CONSTRAINT fk_reservation_on_unit FOREIGN KEY (unit_id) REFERENCES unit (id) ON DELETE CASCADE;
