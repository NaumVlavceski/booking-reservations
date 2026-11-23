package com.naumvlavceski.bookingbackend.admin;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** C2/C3: Delete owner removes everything of that owner and nothing else, atomically, with a minimal audit record. */
class AdminDeleteOwnerTest extends AdminTestBase {

    record Data(TestOwner owner, UUID userId, UUID ownerId) {}

    /** An owner with a property, two rooms, reservations, a calendar, email history, admin notes and codes. */
    private Data ownerWithData(TestOwner admin, String session) throws Exception {
        TestOwner o = newOwner();
        UUID userId = userId(o);
        UUID ownerId = jdbc.queryForObject("SELECT owner_id FROM app_user WHERE id = ?", UUID.class, userId);
        String property = createProperty(o.token(), "House", 2);
        List<String> rooms = roomIds(o.token(), property);
        createReservation(o.token(), rooms.get(0), LocalDate.now().plusDays(3).toString(), LocalDate.now().plusDays(5).toString(), null);
        createReservation(o.token(), rooms.get(1), LocalDate.now().plusDays(3).toString(), LocalDate.now().plusDays(5).toString(), null);
        jdbc.update("INSERT INTO external_calendar (id, unit_id, platform, ics_url, consecutive_failures, created_at) "
                + "VALUES (gen_random_uuid(), ?::uuid, 'BOOKING', 'https://ical.booking.com/v1/export?t=secret', 0, now())", rooms.get(0));
        jdbc.update("INSERT INTO email_log (owner_id, to_address, type, subject, status, attempts) "
                + "VALUES (NULL, ?, 'ADMIN_MESSAGE', 'Hello', 'SENT', 1)", o.email());
        admin(post("/api/admin/owners/" + userId + "/notes"), admin, session, "{\"text\":\"Call them\"}")
                .andExpect(status().isCreated());
        jdbc.update("INSERT INTO password_reset (user_id, code_hash, code_expires_at) VALUES (?, 'x', now())", userId);
        return new Data(o, userId, ownerId);
    }

    private long rowsOf(UUID ownerId) {
        return jdbc.queryForObject("SELECT (SELECT count(*) FROM property WHERE owner_id = ?) + "
                + "(SELECT count(*) FROM unit WHERE owner_id = ?) + (SELECT count(*) FROM reservation WHERE owner_id = ?) + "
                + "(SELECT count(*) FROM app_user WHERE owner_id = ?) + (SELECT count(*) FROM owner WHERE id = ?)",
                Long.class, ownerId, ownerId, ownerId, ownerId, ownerId);
    }

    private String del(TestOwner admin, String session, UUID target, String confirm) throws Exception {
        return body(admin(delete("/api/admin/owners/" + target), admin, session,
                "{\"confirmEmail\":\"" + confirm + "\"}"));
    }

    @Test
    void deletesEverythingOfTheOwnerAndNothingElse() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        Data target = ownerWithData(admin, session);
        Data bystander = ownerWithData(admin, session);
        long bystanderBefore = rowsOf(bystander.ownerId());
        long bystanderEmails = jdbc.queryForObject("SELECT count(*) FROM email_log WHERE lower(to_address) = lower(?)",
                Long.class, bystander.owner().email());

        String summary = body(admin(get("/api/admin/owners/" + target.userId() + "/deletion-summary"), admin, session, null)
                .andExpect(status().isOk()));
        assertEquals(1, (int) JsonPath.read(summary, "$.properties"));
        assertEquals(2, (int) JsonPath.read(summary, "$.units"));
        assertEquals(2, (int) JsonPath.read(summary, "$.reservations"));
        assertEquals(1, (int) JsonPath.read(summary, "$.calendarConnections"));
        assertEquals(1, (int) JsonPath.read(summary, "$.notes"));
        assertTrue((int) JsonPath.read(summary, "$.emailsInHistory") >= 1);

        // Typed email in another case still matches
        admin(delete("/api/admin/owners/" + target.userId()), admin, session,
                "{\"confirmEmail\":\"  " + target.owner().email().toUpperCase() + " \"}").andExpect(status().isOk());

        assertNoLeftovers(target);
        assertEquals(bystanderBefore, rowsOf(bystander.ownerId()), "another owner's data is untouched");
        assertEquals(bystanderEmails, (long) jdbc.queryForObject(
                "SELECT count(*) FROM email_log WHERE lower(to_address) = lower(?)", Long.class, bystander.owner().email()));
        assertEquals(1L, (long) jdbc.queryForObject("SELECT count(*) FROM admin_note WHERE owner_user_id = ?", Long.class,
                bystander.userId()));

        // A minimal audit record: the numeric target id and counts, never the email or name
        Map<String, Object> audit = jdbc.queryForMap("SELECT target_user_id, details::text AS d FROM admin_audit_log "
                + "WHERE action = 'OWNER_DELETED' AND target_user_id = ?", target.userId());
        String d = String.valueOf(audit.get("d"));
        assertTrue(d.contains("\"reservations\": 2"), d);
        assertFalse(d.contains(target.owner().email()));
        assertFalse(d.contains("Audit Owner"));
        // No earlier audit entry about this owner holds the email either
        for (String details : jdbc.queryForList("SELECT coalesce(details::text, '') FROM admin_audit_log WHERE target_user_id = ?",
                String.class, target.userId())) {
            assertFalse(details.toLowerCase().contains(target.owner().email().toLowerCase()));
        }

        // The deleted owner's token no longer works, and the owner is gone from Admin
        send(get("/api/me"), target.owner().token(), null).andExpect(status().isUnauthorized());
        admin(get("/api/admin/owners/" + target.userId()), admin, session, null).andExpect(status().isNotFound());
        admin(delete("/api/admin/owners/" + target.userId()), admin, session, "{\"confirmEmail\":\"x\"}")
                .andExpect(status().isNotFound());
    }

    /** Every column with a foreign key to app_user or owner, the by-convention references, and every text column. */
    private void assertNoLeftovers(Data t) {
        List<Map<String, Object>> fks = jdbc.queryForList(
                "SELECT kcu.table_name AS tbl, kcu.column_name AS col, ccu.table_name AS ref "
                        + "FROM information_schema.table_constraints tc "
                        + "JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema "
                        + "JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema "
                        + "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND ccu.table_name IN ('app_user', 'owner')");
        assertTrue(fks.size() >= 10, "found the references: " + fks);
        for (Map<String, Object> fk : fks) {
            UUID id = "owner".equals(fk.get("ref")) ? t.ownerId() : t.userId();
            Long left = jdbc.queryForObject("SELECT count(*) FROM " + fk.get("tbl") + " WHERE " + fk.get("col") + " = ?",
                    Long.class, id);
            assertEquals(0L, left, fk.get("tbl") + "." + fk.get("col") + " still points to the deleted owner");
        }
        assertEquals(0L, (long) jdbc.queryForObject("SELECT count(*) FROM app_user WHERE id = ?", Long.class, t.userId()));
        assertEquals(0L, (long) jdbc.queryForObject("SELECT count(*) FROM owner WHERE id = ?", Long.class, t.ownerId()));

        // No text anywhere still holds the owner's email
        List<Map<String, Object>> cols = jdbc.queryForList("SELECT table_name AS tbl, column_name AS col FROM information_schema.columns "
                + "WHERE table_schema = 'public' AND data_type IN ('character varying', 'text', 'jsonb')");
        for (Map<String, Object> c : cols) {
            Long hits = jdbc.queryForObject("SELECT count(*) FROM " + c.get("tbl") + " WHERE " + c.get("col")
                    + "::text ILIKE ?", Long.class, "%" + t.owner().email() + "%");
            assertEquals(0L, hits, c.get("tbl") + "." + c.get("col") + " still contains the owner's email");
        }
    }

    @Test
    void guards() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        TestOwner otherAdmin = newAdmin();
        TestOwner owner = newOwner();
        TestOwner demo = newOwner();
        jdbc.update("UPDATE owner SET demo = TRUE WHERE id = (SELECT owner_id FROM app_user WHERE id = ?)", userId(demo));

        admin(delete("/api/admin/owners/" + userId(owner)), admin, session, "{\"confirmEmail\":\"wrong@example.test\"}")
                .andExpect(status().isBadRequest());
        admin(delete("/api/admin/owners/" + userId(owner)), admin, session, "{}").andExpect(status().isBadRequest());
        admin(delete("/api/admin/owners/" + userId(admin)), admin, session, "{\"confirmEmail\":\"" + admin.email() + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You can't delete your own account here."));
        admin(delete("/api/admin/owners/" + userId(otherAdmin)), admin, session, "{\"confirmEmail\":\"" + otherAdmin.email() + "\"}")
                .andExpect(status().isBadRequest());
        // Five tries used up the first admin's hourly limit: the rest from another admin
        String otherSession = openSession(otherAdmin);
        admin(delete("/api/admin/owners/" + userId(demo)), otherAdmin, otherSession, "{\"confirmEmail\":\"" + demo.email() + "\"}")
                .andExpect(status().isNotFound());
        admin(delete("/api/admin/owners/" + UUID.randomUUID()), otherAdmin, otherSession, "{\"confirmEmail\":\"x@example.test\"}")
                .andExpect(status().isNotFound());
        assertEquals(1L, (long) jdbc.queryForObject("SELECT count(*) FROM app_user WHERE id = ?", Long.class, userId(owner)));
        assertEquals(1L, (long) jdbc.queryForObject("SELECT count(*) FROM app_user WHERE id = ?", Long.class, userId(otherAdmin)));
    }

    @Test
    void atMostFivePerHour() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        TestOwner owner = newOwner();
        for (int i = 0; i < 5; i++) {
            admin(delete("/api/admin/owners/" + userId(owner)), admin, session, "{\"confirmEmail\":\"no@example.test\"}")
                    .andExpect(status().isBadRequest());
        }
        admin(delete("/api/admin/owners/" + userId(owner)), admin, session, "{\"confirmEmail\":\"" + owner.email() + "\"}")
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void aFailureHalfwayRollsEverythingBack() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        Data target = ownerWithData(admin, session);
        long before = rowsOf(target.ownerId());
        String table = "test_block_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        // A row the deletion doesn't know about blocks the very last step (deleting the owner)
        jdbc.execute("CREATE TABLE " + table + " (owner_id UUID REFERENCES owner (id))");
        try {
            jdbc.update("INSERT INTO " + table + " VALUES (?)", target.ownerId());
            int status = admin(delete("/api/admin/owners/" + target.userId()), admin, session,
                    "{\"confirmEmail\":\"" + target.owner().email() + "\"}").andReturn().getResponse().getStatus();
            if (status < 400) fail("the delete should have failed, got " + status);
        } finally {
            jdbc.execute("DROP TABLE " + table);
        }
        assertEquals(before, rowsOf(target.ownerId()), "nothing was deleted");
        assertEquals(1L, (long) jdbc.queryForObject("SELECT count(*) FROM admin_note WHERE owner_user_id = ?", Long.class,
                target.userId()));
        assertEquals(1L, (long) jdbc.queryForObject("SELECT count(*) FROM external_calendar c JOIN unit x ON x.id = c.unit_id "
                + "WHERE x.owner_id = ?", Long.class, target.ownerId()));
        assertEquals(0L, (long) jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE action = 'OWNER_DELETED' "
                + "AND target_user_id = ?", Long.class, target.userId()), "no audit record for a delete that didn't happen");
    }
}
