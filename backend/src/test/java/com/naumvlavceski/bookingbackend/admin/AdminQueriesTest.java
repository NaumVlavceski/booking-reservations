package com.naumvlavceski.bookingbackend.admin;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.admin.AdminDtos.OwnerDetail;
import com.naumvlavceski.bookingbackend.admin.AdminDtos.Overview;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.naumvlavceski.bookingbackend.admin.AttentionRules.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * B2/B3/B5: owner list and search, the "needs help" rules with a fixed clock, the funnel, what the DTOs may never
 * contain, notes and their audit, and the system status. Fixed-clock tests put their owners in the far future so other
 * tests' owners (registered "now") never fall into their windows.
 */
class AdminQueriesTest extends AdminTestBase {

    @Autowired NamedParameterJdbcTemplate named;
    @Autowired AdminProperties props;
    @Autowired SystemStatusService system;

    private AdminDataFixture fx;

    @BeforeEach
    void fixture() {
        fx = new AdminDataFixture(jdbc);
    }

    private AdminQueryService at(Instant now) {
        return new AdminQueryService(named, Clock.fixed(now, ZoneOffset.UTC), props, system);
    }

    private static List<String> codes(OwnerDetail d) {
        return d.attention().stream().map(AdminDtos.Reason::code).toList();
    }

    // ---------- needs help, fixed clock ----------

    @Test
    void attentionRulesWithAFixedClock() {
        Instant now = Instant.parse("2099-06-30T12:00:00Z");
        AdminQueryService q = at(now);
        Instant recent = now.minus(Duration.ofHours(1));

        // UNVERIFIED_24H: 25 h old and unverified yes, 23 h no
        var unverified = fx.owner("Unverified", null, now.minus(Duration.ofHours(25)), null, null);
        var young = fx.owner("Young", null, now.minus(Duration.ofHours(23)), null, null);
        assertTrue(codes(q.owner(unverified.userId())).contains(UNVERIFIED_24H));
        assertFalse(codes(q.owner(young.userId())).contains(UNVERIFIED_24H));

        // SYNC_FAILING: 2 failures in a row; or no success for 48 h; a fresh healthy calendar is fine
        var failing = fx.owner("Failing", null, now.minus(Duration.ofDays(1)), now, recent);
        UUID unit = fx.unit(failing, fx.property(failing), "Studio 1");
        fx.calendar(unit, "https://ical.booking.com/v1/export?t=secret-token-1", 2, recent, now.minus(Duration.ofDays(1)));
        OwnerDetail f = q.owner(failing.userId());
        assertTrue(codes(f).contains(SYNC_FAILING));
        assertTrue(f.attention().getFirst().text().contains("Studio 1 (Booking.com) failed 2 times in a row"));

        var stale = fx.owner("Stale", null, now.minus(Duration.ofDays(5)), now, recent);
        fx.calendar(fx.unit(stale, fx.property(stale), "Room"), "https://ical.booking.com/x", 0,
                now.minus(Duration.ofHours(49)), now.minus(Duration.ofDays(5)));
        assertTrue(codes(q.owner(stale.userId())).contains(SYNC_FAILING));

        var healthy = fx.owner("Healthy", null, now.minus(Duration.ofDays(5)), now, recent);
        UUID hUnit = fx.unit(healthy, fx.property(healthy), "Room");
        fx.calendar(hUnit, "https://ical.booking.com/y", 1, now.minus(Duration.ofHours(2)), now.minus(Duration.ofDays(5)));
        fx.reservation(healthy, hUnit, LocalDate.of(2099, 7, 1), LocalDate.of(2099, 7, 3), now.minus(Duration.ofDays(2)));
        assertEquals(List.of(), codes(q.owner(healthy.userId())), "a healthy, active owner needs nothing");

        // OPEN_CONFLICTS
        var conflicted = fx.owner("Conflicted", null, now.minus(Duration.ofDays(1)), now, recent);
        UUID cUnit = fx.unit(conflicted, fx.property(conflicted), "Studio 2");
        fx.conflict(conflicted, cUnit, fx.calendar(cUnit, "https://ical.booking.com/z", 0, recent, recent));
        OwnerDetail c = q.owner(conflicted.userId());
        assertTrue(codes(c).contains(OPEN_CONFLICTS));
        assertTrue(c.attention().stream().anyMatch(r -> r.text().equals("1 open double booking on Studio 2.")));

        // STUCK_ONBOARDING: 4 days and no units yes; 2 days no; units + reservation no
        var stuck = fx.owner("Stuck", null, now.minus(Duration.ofDays(4)), now, recent);
        var early = fx.owner("Early", null, now.minus(Duration.ofDays(2)), now, recent);
        assertTrue(codes(q.owner(stuck.userId())).contains(STUCK_ONBOARDING));
        assertFalse(codes(q.owner(early.userId())).contains(STUCK_ONBOARDING));

        // EMAIL_BOUNCED: within 30 days yes, 31 days ago no
        var bounced = fx.owner("Bounced", null, now.minus(Duration.ofDays(1)), now, recent);
        fx.email(bounced, "BOUNCED", now.minus(Duration.ofDays(29)));
        var oldBounce = fx.owner("Old bounce", null, now.minus(Duration.ofDays(1)), now, recent);
        fx.email(oldBounce, "BOUNCED", now.minus(Duration.ofDays(31)));
        fx.email(oldBounce, "DELIVERED", now.minus(Duration.ofDays(1)));
        assertTrue(codes(q.owner(bounced.userId())).contains(EMAIL_BOUNCED));
        assertFalse(codes(q.owner(oldBounce.userId())).contains(EMAIL_BOUNCED));

        // INACTIVE_14D: seen 15 days ago yes; never seen and 15 days old yes; never seen and 13 days old no
        var inactive = fx.owner("Inactive", null, now.minus(Duration.ofDays(40)), now, now.minus(Duration.ofDays(15)));
        var neverOld = fx.owner("Never old", null, now.minus(Duration.ofDays(15)), now, null);
        var neverNew = fx.owner("Never new", null, now.minus(Duration.ofDays(13)), now, null);
        assertTrue(codes(q.owner(inactive.userId())).contains(INACTIVE_14D));
        assertTrue(codes(q.owner(neverOld.userId())).contains(INACTIVE_14D));
        assertFalse(codes(q.owner(neverNew.userId())).contains(INACTIVE_14D));
    }

    @Test
    void adminsAndDemoAccountsAreNeverListed() throws Exception {
        TestOwner admin = newAdmin();
        TestOwner demo = newOwner();
        jdbc.update("UPDATE owner SET demo = TRUE WHERE id = (SELECT owner_id FROM app_user WHERE lower(email) = lower(?))",
                demo.email());
        String session = openSession(admin);
        admin(get("/api/admin/owners/" + userId(admin)), admin, session, null).andExpect(status().isNotFound());
        admin(get("/api/admin/owners/" + userId(demo)), admin, session, null).andExpect(status().isNotFound());
        String list = body(admin(get("/api/admin/owners?filter=all&query=" + demo.email()), admin, session, null)
                .andExpect(status().isOk()));
        assertEquals(0, (int) JsonPath.read(list, "$.totalElements"));
    }

    // ---------- funnel ----------

    @Test
    void funnelCountsOnAFixedDataset() {
        // A random far-future window, so reruns on the same database never see each other's owners
        Instant now = Instant.parse("2101-03-31T12:00:00Z").plus(Duration.ofDays(400L * new java.util.Random().nextInt(1, 5000)));
        Instant created = now.minus(Duration.ofDays(3));
        // 4 owners in the window: 3 verified, 2 with a property, 2 with a unit, 1 with a calendar, 1 with a booking
        var a = fx.owner("A", null, created, created, created);
        var b = fx.owner("B", null, created, created, created);
        fx.owner("C", null, created, created, created);
        fx.owner("D", null, created, null, null);
        fx.owner("Outside", null, now.minus(Duration.ofDays(31)), created, created);
        UUID ua = fx.unit(a, fx.property(a), "R");
        fx.unit(b, fx.property(b), "R");
        fx.calendar(ua, "https://ical.booking.com/f", 0, created, created);
        fx.reservation(a, ua, LocalDate.ofInstant(now, ZoneOffset.UTC), LocalDate.ofInstant(now, ZoneOffset.UTC).plusDays(1), created);

        Overview o = at(now).overview(List.of());
        assertEquals(4, o.funnelRegistered());
        assertEquals(List.of(4L, 3L, 2L, 2L, 1L, 1L), o.funnel().stream().map(AdminDtos.FunnelStep::count).toList());
        assertEquals(List.of(100, 75, 50, 50, 25, 25), o.funnel().stream().map(AdminDtos.FunnelStep::percent).toList());
        assertEquals(25, o.finishedSetupPercent());
        assertEquals(4, o.newOwners7d());
    }

    // ---------- search ----------

    private List<String> searchAll(TestOwner admin, String session, String query, String marker) throws Exception {
        List<String> names = new ArrayList<>();
        for (int page = 0; page < 100; page++) {
            String json = body(admin(get("/api/admin/owners").param("filter", "all").param("query", query)
                    .param("page", "" + page).param("size", "50"), admin, session, null).andExpect(status().isOk()));
            List<String> got = JsonPath.read(json, "$.items[*].name");
            got.stream().filter(n -> n != null && n.contains(marker)).forEach(names::add);
            if ((int) JsonPath.read(json, "$.totalPages") <= page + 1) break;
        }
        return names;
    }

    @Test
    void searchIsAContainsMatchOnNameEmailAndPhone() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        String m = "m" + UUID.randomUUID().toString().substring(0, 6);
        Instant now = Instant.now();
        fx.owner("Ana " + m, "+389 (70) 123-456", now, now, now);
        fx.owner("Banana " + m, null, now, now, now);
        fx.owner("Петар " + m, null, now, now, now);
        fx.owner("Pct 100% " + m, null, now, now, now);
        fx.owner("Under_score " + m, null, now, now, now);
        fx.owner("O'Brien " + m, null, now, now, now);

        List<String> an = searchAll(admin, session, "an", m);
        assertTrue(an.contains("Ana " + m) && an.contains("Banana " + m), an.toString());
        assertEquals(List.of("Banana " + m), searchAll(admin, session, "  BANANA " + m + "  ", m), "trimmed, case-insensitive");
        assertEquals(List.of("Петар " + m), searchAll(admin, session, "пета", m), "Cyrillic, case-insensitive");
        assertEquals(List.of("Ana " + m), searchAll(admin, session, "70 123 456", m), "phone, digits only");
        assertEquals(List.of("Ana " + m), searchAll(admin, session, "+3897012", m), "phone with +");
        assertEquals(List.of("Pct 100% " + m), searchAll(admin, session, "100%", m), "% matches itself");
        assertEquals(List.of("Under_score " + m), searchAll(admin, session, "r_s", m), "_ matches itself");
        assertEquals(List.of("O'Brien " + m), searchAll(admin, session, "o'b", m), "quotes are data");

        // Shorter than 2 characters: no search, the normal list
        String one = body(admin(get("/api/admin/owners").param("filter", "all").param("query", "a"), admin, session, null)
                .andExpect(status().isOk()));
        String none = body(admin(get("/api/admin/owners").param("filter", "all"), admin, session, null)
                .andExpect(status().isOk()));
        assertEquals((int) JsonPath.read(none, "$.totalElements"), (int) JsonPath.read(one, "$.totalElements"));

        admin(get("/api/admin/owners").param("query", "x".repeat(101)), admin, session, null).andExpect(status().isBadRequest());
        admin(get("/api/admin/owners").param("page", "-1"), admin, session, null).andExpect(status().isBadRequest());
        admin(get("/api/admin/owners").param("size", "0"), admin, session, null).andExpect(status().isBadRequest());
        admin(get("/api/admin/owners").param("size", "51"), admin, session, null).andExpect(status().isBadRequest());
        admin(get("/api/admin/owners").param("filter", "nope"), admin, session, null).andExpect(status().isBadRequest());
        // A page past the end is simply empty; the first page is the default
        String far = body(admin(get("/api/admin/owners").param("filter", "all").param("query", m).param("page", "99"),
                admin, session, null).andExpect(status().isOk()));
        assertEquals(0, ((List<?>) JsonPath.read(far, "$.items")).size());
        String first = body(admin(get("/api/admin/owners").param("filter", "all").param("query", m), admin, session, null)
                .andExpect(status().isOk()));
        assertEquals(0, (int) JsonPath.read(first, "$.page"));
        assertEquals(6, (int) JsonPath.read(first, "$.totalElements"));

        // The search term is never audited
        assertFalse(jdbc.queryForList("SELECT coalesce(details::text, '') FROM admin_audit_log WHERE admin_user_id = ?",
                String.class, userId(admin)).toString().contains(m));
    }

    @Test
    void searchLikePatternEscaping() {
        assertEquals("%100\\%%", AdminQueryService.containsPattern("100%"));
        assertEquals("%a\\_b%", AdminQueryService.containsPattern("a_b"));
        assertEquals("%a\\\\b%", AdminQueryService.containsPattern("a\\b"));
        assertNull(AdminQueryService.normalizeTerm(" a "));
        assertEquals("ab", AdminQueryService.normalizeTerm(" ab "));
        assertEquals("38970", AdminQueryService.phoneDigits("+389 (70)"));
        assertNull(AdminQueryService.phoneDigits("an"));
        assertThrows(IllegalArgumentException.class, () -> AdminQueryService.checkPaging(-1, 20));
    }

    // ---------- DTO safety ----------

    @Test
    void responsesNeverContainSecretsOrPrivateGuestDetails() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        Instant now = Instant.now();
        var o = fx.owner("Safe " + UUID.randomUUID(), "+389 70 000 000", now.minus(Duration.ofDays(1)), now, now);
        UUID unit = fx.unit(o, fx.property(o), "Studio 1");
        fx.calendar(unit, "https://ical.booking.com/v1/export?t=verysecrettoken123", 3, now, now);
        fx.reservation(o, unit, LocalDate.now().plusDays(3), LocalDate.now().plusDays(5), now);
        String icalToken = jdbc.queryForObject("SELECT ical_token FROM unit WHERE id = ?", String.class, unit);
        String hash = jdbc.queryForObject("SELECT password_hash FROM app_user WHERE id = ?", String.class, o.userId());

        StringBuilder all = new StringBuilder();
        for (String path : List.of("/api/admin/owners/" + o.userId(), "/api/admin/owners/" + o.userId() + "/reservations",
                "/api/admin/owners/" + o.userId() + "/calendars", "/api/admin/owners/" + o.userId() + "/emails",
                "/api/admin/owners?filter=all&query=" + o.email(), "/api/admin/overview")) {
            all.append(body(admin(get(path), admin, session, null).andExpect(status().isOk())));
        }
        String json = all.toString();
        for (String forbidden : List.of("verysecrettoken123", "/v1/export", icalToken, hash, "passwordHash", "password_hash",
                "tokenVersion", "token_version", "codeHash", "icsUrl", "ics_url", "icalToken",
                "guest@example.test", "+389 70 111 222", "private note")) {
            assertFalse(json.contains(forbidden), "must not contain " + forbidden);
        }
        assertTrue(json.contains("\"host\":\"ical.booking.com\""), "calendar shown as host only");
        assertTrue(json.contains("Guest Person"), "guest names are shown");
        assertTrue(json.contains(o.email()), "owner emails are shown");
    }

    // ---------- notes ----------

    @Test
    void notesAreAuditedWithIdsOnly() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        TestOwner owner = newOwner();
        UUID target = userId(owner);
        String text = "Call about the second unit " + UUID.randomUUID();
        String created = body(admin(post("/api/admin/owners/" + target + "/notes"), admin, session,
                "{\"text\":\"" + text + "\",\"remindOn\":\"" + LocalDate.now(ZoneOffset.UTC) + "\"}")
                .andExpect(status().isCreated()));
        String noteId = JsonPath.read(created, "$.id");

        String due = body(admin(get("/api/admin/follow-ups"), admin, session, null).andExpect(status().isOk()));
        assertTrue(due.contains(noteId));
        admin(patch("/api/admin/notes/" + noteId), admin, session, "{\"text\":\"" + text + "\",\"done\":true}")
                .andExpect(status().isOk());
        assertFalse(body(admin(get("/api/admin/follow-ups"), admin, session, null)).contains(noteId), "done notes are not due");
        admin(post("/api/admin/owners/" + target + "/notes"), admin, session, "{\"text\":\"   \"}")
                .andExpect(status().isBadRequest());
        admin(post("/api/admin/owners/" + target + "/notes"), admin, session, "{\"text\":\"" + "x".repeat(4001) + "\"}")
                .andExpect(status().isBadRequest());
        admin(delete("/api/admin/notes/" + noteId), admin, session, null).andExpect(status().isNoContent());

        List<Map<String, Object>> audit = jdbc.queryForList("SELECT action, target_user_id, details::text AS d "
                + "FROM admin_audit_log WHERE admin_user_id = ? AND action LIKE 'NOTE_%' ORDER BY created_at", userId(admin));
        assertEquals(List.of("NOTE_CREATED", "NOTE_UPDATED", "NOTE_DELETED"), audit.stream().map(r -> r.get("action")).toList());
        audit.forEach(r -> {
            assertEquals(target, r.get("target_user_id"));
            assertTrue(String.valueOf(r.get("d")).contains(noteId));
            assertFalse(String.valueOf(r.get("d")).contains("Call about"));
        });
    }

    // ---------- system ----------

    @Test
    void systemStatusWithAndWithoutTheBackupDirectory() throws Exception {
        Instant now = Instant.now();
        AdminProperties base = props;
        SystemStatusService none = new SystemStatusService(jdbc, Clock.systemUTC(), base, null);
        assertEquals("UNKNOWN", none.lastBackup(now).state());

        Path dir = Files.createTempDirectory("backups");
        AdminProperties withDir = new AdminProperties(true, 30, 8, dir.toString(), "/", 730, base.attention());
        SystemStatusService svc = new SystemStatusService(jdbc, Clock.systemUTC(), withDir, null);
        assertEquals("UNKNOWN", svc.lastBackup(now).state(), "empty directory");
        Path file = Files.writeString(dir.resolve("booking-2026.dump"), "x".repeat(2048));
        assertEquals("OK", svc.lastBackup(now).state());
        assertEquals(2048L, svc.lastBackup(now).bytes());
        assertTrue(file.toFile().setLastModified(now.minus(Duration.ofHours(37)).toEpochMilli()));
        assertEquals("STALE", svc.lastBackup(now).state());

        AdminProperties missing = new AdminProperties(true, 30, 8, dir.resolve("not-mounted").toString(), "/", 730,
                base.attention());
        assertEquals("UNKNOWN", new SystemStatusService(jdbc, Clock.systemUTC(), missing, null).lastBackup(now).state());

        TestOwner admin = newAdmin();
        String session = openSession(admin);
        String json = body(admin(get("/api/admin/system"), admin, session, null).andExpect(status().isOk()));
        assertEquals("29", JsonPath.read(json, "$.flywayVersion"));
        assertEquals("UNKNOWN", JsonPath.read(json, "$.backupState"));
    }
}
