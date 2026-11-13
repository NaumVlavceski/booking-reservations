package com.naumvlavceski.bookingbackend.audit.business;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Phase 3.2: the database itself refuses double bookings, whatever the application does. Reads the live Testcontainers
 * schema (built by the real Flyway migrations) and writes rows with plain SQL, bypassing ReservationService.
 */
class NoOverlapConstraintTest extends BusinessTestBase {

    @Test
    void noOverlapIsAnExclusionConstraintOnUnitAndHalfOpenRangeIgnoringCancelled() {
        Map<String, Object> c = jdbc.queryForMap("""
                SELECT c.contype::text AS type, c.convalidated AS validated, pg_get_constraintdef(c.oid) AS def,
                       am.amname AS method
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_class i ON i.oid = c.conindid
                JOIN pg_am am ON am.oid = i.relam
                WHERE t.relname = 'reservation' AND c.conname = 'no_overlap'
                """);
        String def = (String) c.get("def");
        assertEquals("x", c.get("type"), def);          // x = EXCLUDE constraint
        assertEquals("gist", c.get("method"), def);
        assertEquals(Boolean.TRUE, c.get("validated"), def);
        assertTrue(def.startsWith("EXCLUDE USING gist (unit_id WITH =, stay_range WITH &&)"), def);
        assertTrue(def.contains("WHERE") && def.contains("status") && def.contains("<> 'CANCELLED'"), def);

        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM pg_extension WHERE extname = 'btree_gist'", Integer.class));
        assertEquals("daterange", jdbc.queryForObject("""
                SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid
                WHERE t.relname = 'reservation' AND a.attname = 'stay_range'""", String.class));

        // stay_not_empty (V25) is NOT VALID: enforced on new and changed rows, old rows were not re-checked
        Map<String, Object> notEmpty = jdbc.queryForMap("""
                SELECT pg_get_constraintdef(c.oid) AS def, c.convalidated AS validated FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'reservation' AND c.conname = 'stay_not_empty'""");
        assertTrue(((String) notEmpty.get("def")).contains("isempty(stay_range)"));
        assertEquals(Boolean.FALSE, notEmpty.get("validated"));
    }

    @Test
    void rawSqlOverlapIsRefusedByTheDatabase() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        insertRaw(room, "2032-01-10", "2032-01-15", "CONFIRMED", "DIRECT", "First", null);

        for (String status : new String[]{"CONFIRMED", "PAID", "BLOCK"}) {
            DataIntegrityViolationException e = assertThrows(DataIntegrityViolationException.class,
                    () -> insertRaw(room, "2032-01-14", "2032-01-16", status, "DIRECT", "Second", BigDecimal.TEN));
            assertTrue(e.getMostSpecificCause().getMessage().contains("no_overlap"), e.getMostSpecificCause().getMessage());
        }
        // an imported (BOOKING) row is held to the same rule
        assertThrows(DataIntegrityViolationException.class,
                () -> insertRaw(room, "2032-01-10", "2032-01-11", "CONFIRMED", "BOOKING", "Import", null));
        assertEquals(1, liveCount(room));
    }

    @Test
    void rawSqlAllowsBackToBackCancelledOverlapsAndOtherRooms() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String other = newRoom(o.token());
        insertRaw(room, "2032-02-10", "2032-02-15", "CONFIRMED", "DIRECT", "First", null);
        insertRaw(room, "2032-02-15", "2032-02-16", "CONFIRMED", "DIRECT", "Back to back", null);
        String cancelled = insertRaw(room, "2032-02-11", "2032-02-13", "CANCELLED", "DIRECT", "Cancelled", null);
        insertRaw(room, "2032-02-11", "2032-02-13", "CANCELLED", "DIRECT", "Cancelled too", null);
        insertRaw(other, "2032-02-10", "2032-02-15", "CONFIRMED", "DIRECT", "Other room", null);
        assertEquals(2, liveCount(room));

        // reviving a cancelled row into taken nights is refused too
        DataIntegrityViolationException e = assertThrows(DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE reservation SET status = 'CONFIRMED' WHERE id = ?::uuid", cancelled));
        assertTrue(e.getMostSpecificCause().getMessage().contains("no_overlap"));
        // and so is moving a row into another room's taken nights
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "UPDATE reservation SET unit_id = ?::uuid WHERE unit_id = ?::uuid AND guest_name = 'First'", other, room));
    }

    @Test
    void rawSqlEmptyOrUnboundedRangesAreRefused() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        // An empty range overlaps nothing, so no_overlap alone could not see it: stay_not_empty catches it
        DataIntegrityViolationException e = assertThrows(DataIntegrityViolationException.class,
                () -> insertRaw(room, "2032-03-01", "2032-03-01", "CONFIRMED", "DIRECT", "Empty", null));
        assertTrue(e.getMostSpecificCause().getMessage().contains("stay_not_empty"), e.getMostSpecificCause().getMessage());
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("""
                INSERT INTO reservation (id, unit_id, owner_id, stay_range, status, source, guests_count)
                VALUES (gen_random_uuid(), ?::uuid, (SELECT owner_id FROM unit WHERE id = ?::uuid),
                        daterange('2032-03-01'::date, NULL, '[)'), 'CONFIRMED', 'DIRECT', 2)""", room, room));
        assertEquals(0, liveCount(room));
    }

    @Test
    void rowsWrittenOutsideTheApiAreStillRespectedByTheApi() throws Exception {
        // A row inserted by SQL (as an import or a manual fix would) is seen by the API's own check on restore
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        insertRaw(room, "2032-04-01", "2032-04-03", "CONFIRMED", "DIRECT", "Raw", null);
        String api = createReservation(o.token(), room, "2032-04-03", "2032-04-05", null);
        jdbc.update("UPDATE reservation SET status = 'CANCELLED' WHERE id = ?::uuid", api);
        jdbc.update("UPDATE reservation SET stay_range = daterange('2032-04-01','2032-04-05','[)') WHERE id = ?::uuid", api);
        putJson("/api/reservations/" + api, o.token(), reservationJson(room, "2032-04-01", "2032-04-05", "\"status\":\"CONFIRMED\""))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code").value("DATES_TAKEN"));
    }
}
