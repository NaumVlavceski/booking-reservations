package com.naumvlavceski.bookingbackend.audit.ical;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.sun.net.httpserver.HttpHandler;
import org.junit.jupiter.api.Test;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.calendar;
import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.event;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What the owner sees when a feed fails, and that a failed sync never touches existing bookings. Every case first
 * imports two bookings successfully, then breaks the feed.
 */
class IcalSyncFailureAuditTest extends IcalAuditSupport {

    private static final String FAILING = "CALENDAR_SYNC_FAILING";

    private String goodFeed() {
        return calendar(event("g1@booking.com", inDays(10), inDays(12), "Ana"),
                event("g2@booking.com", inDays(20), inDays(23), "CLOSED - Not available"));
    }

    private record Setup(Room room, UUID cal, List<Map<String, Object>> before) {}

    private Setup importedThenBroken(HttpHandler broken) throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", goodFeed());
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        List<Map<String, Object>> before = rows(room);
        assertEquals(2, before.size());
        stub.handle("/f", broken);
        return new Setup(room, cal, before);
    }

    private void assertFailedAndUntouched(Setup s, String expectedError) throws Exception {
        ExternalCalendar c = calendarRow(s.cal());
        assertEquals(expectedError, c.getLastError());
        assertEquals(1, c.getConsecutiveFailures());
        assertNotNull(c.getLastSuccessAt(), "the earlier success is kept");
        assertTrue(c.getLastSyncedAt().isAfter(c.getLastSuccessAt()));
        assertEquals(s.before(), rows(s.room()), "a failed sync must not change any reservation");

        send(get("/api/units/" + s.room().roomId() + "/calendars"), s.room().token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].lastError").value(expectedError))
                .andExpect(jsonPath("$[0].consecutiveFailures").value(1));
        send(get("/api/calendars/health"), s.room().token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(s.cal().toString()))
                .andExpect(jsonPath("$[0].lastError").value(expectedError))
                .andExpect(jsonPath("$[0].unitName").isNotEmpty());
    }

    @Test
    void httpErrorsAndBadBodiesAreReportedAndChangeNothing() throws Exception {
        Map<String, HttpHandler> cases = new LinkedHashMap<>();
        Map<String, String> expected = new LinkedHashMap<>();
        cases.put("500", e -> StubFeedServer.respond(e, 500, "boom"));
        expected.put("500", "Feed returned HTTP 500");
        cases.put("503", e -> StubFeedServer.respond(e, 503, ""));
        expected.put("503", "Feed returned HTTP 503");
        cases.put("404", e -> StubFeedServer.respond(e, 404, "gone"));
        expected.put("404", "Feed returned HTTP 404");
        cases.put("403", e -> StubFeedServer.respond(e, 403, "no"));
        expected.put("403", "Feed returned HTTP 403");
        cases.put("302", e -> {
            e.getResponseHeaders().add("Location", "http://127.0.0.1:1/elsewhere");
            StubFeedServer.respond(e, 302, "");
        });
        expected.put("302", "Feed returned HTTP 302");
        cases.put("html", e -> StubFeedServer.respond(e, 200, "<html><body>Please sign in</body></html>"));
        expected.put("html", "Response is not an iCal feed");
        cases.put("empty-200", e -> StubFeedServer.respond(e, 200, ""));
        expected.put("empty-200", "Response is not an iCal feed");
        cases.put("truncated", e -> StubFeedServer.respond(e, 200,
                "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:g1@booking.com\r\n"));
        expected.put("truncated", "Feed was cut off before its end");

        for (var c : cases.entrySet()) {
            Setup s = importedThenBroken(c.getValue());
            syncService.sync(s.cal());
            assertFailedAndUntouched(s, expected.get(c.getKey()));
        }
    }

    @Test
    void aRedirectLoopFailsAfterOneRequest() throws Exception {
        Setup s = importedThenBroken(e -> {
            e.getResponseHeaders().add("Location", "/f");
            StubFeedServer.respond(e, 302, "");
        });
        int before = stub.hits("/f");
        syncService.sync(s.cal());
        assertEquals(before + 1, stub.hits("/f"));
        assertFailedAndUntouched(s, "Feed returned HTTP 302");
    }

    @Test
    void anUnreachableFeedIsAFailureNotAHang() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", goodFeed());
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        List<Map<String, Object>> before = rows(room);
        calendars.save(withUrl(cal, "http://127.0.0.1:1/f"));
        syncService.sync(cal);
        ExternalCalendar c = calendarRow(cal);
        Feeds.recordTiming("lastError for a refused connection: " + c.getLastError());
        assertTrue(c.getLastError().startsWith("Failed after 3 attempts"), c.getLastError());
        assertEquals(1, c.getConsecutiveFailures());
        assertEquals(before, rows(room));
    }

    private ExternalCalendar withUrl(UUID cal, String url) {
        ExternalCalendar c = calendarRow(cal);
        c.setIcsUrl(url);
        return c;
    }

    @Test
    void threeFailuresInARowSendOneAlertAndASuccessResetsTheStreak() throws Exception {
        Setup s = importedThenBroken(e -> StubFeedServer.respond(e, 500, "boom"));
        UUID owner = s.room().ownerId();
        syncService.sync(s.cal());
        syncService.sync(s.cal());
        settle();
        assertEquals(0, emails(owner, FAILING));
        syncService.sync(s.cal());
        assertEquals(1, awaitEmails(owner, FAILING, 1));
        syncService.sync(s.cal());
        syncService.sync(s.cal());
        settle();
        assertEquals(1, emails(owner, FAILING), "one alert per failing streak");
        assertEquals(5, calendarRow(s.cal()).getConsecutiveFailures());

        stub.serve("/f", goodFeed());
        syncService.sync(s.cal());
        ExternalCalendar c = calendarRow(s.cal());
        assertEquals(0, c.getConsecutiveFailures());
        assertNull(c.getLastError());
        send(get("/api/calendars/health"), s.room().token(), null).andExpect(jsonPath("$.length()").value(0));
        assertEquals(s.before(), rows(s.room()));
    }

    @Test
    void aSlowButCompleteFeedSucceeds() throws Exception {
        Room room = newOwnerRoom();
        stub.handle("/f", e -> {
            try { Thread.sleep(3_000); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            StubFeedServer.respond(e, 200, goodFeed());
        });
        UUID cal = connect(room, "/f");
        long t0 = System.nanoTime();
        syncService.sync(cal);
        Feeds.recordTiming("sync with a 3 s slow feed: " + (System.nanoTime() - t0) / 1_000_000 + " ms");
        assertNull(calendarRow(cal).getLastError());
        assertEquals(2, activeRows(room).size());
    }

    @Test
    void aFeedThatStallsHoldsTheSyncForAboutFortyFiveSeconds() throws Exception {
        // The real timeouts (15 s per attempt, 3 attempts): this is the per-calendar worst case behind ICAL-07.
        Setup s = importedThenBroken(e -> {
            e.sendResponseHeaders(200, 0);
            OutputStream out = e.getResponseBody();
            out.write("BEGIN:VCALENDAR\r\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            try { stub.closed.await(); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        });
        long t0 = System.nanoTime();
        syncService.sync(s.cal());
        long ms = (System.nanoTime() - t0) / 1_000_000;
        Feeds.recordTiming("sync of a stalled feed (real 15 s x 3 timeouts): " + ms + " ms");
        assertTrue(ms >= 44_000 && ms < 60_000, "took " + ms + " ms");
        assertFailedAndUntouched(s, "Failed after 3 attempts: Timed out after 15 seconds");
    }

    @Test
    void aHealthySyncIsFast() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", goodFeed());
        UUID cal = connect(room, "/f");
        syncService.sync(cal); // first: imports
        long t0 = System.nanoTime();
        int n = 10;
        for (int i = 0; i < n; i++) syncService.sync(cal);
        long avg = (System.nanoTime() - t0) / 1_000_000 / n;
        Feeds.recordTiming("healthy unchanged 2-event sync against a local stub: avg " + avg + " ms");
        assertTrue(avg < 5_000);
    }

    @Test
    void aLargeFeedImportsAndResyncsWithoutDuplicates() throws Exception {
        // 1,000 events by default to keep the suite fast; -Dical.audit.bulkEvents=5000 reproduces the 5,000-event
        // timing quoted in Docs/testing/report/ical.md (ICAL-07): about 36 ms per new event, 16 ms per unchanged one.
        int n = Integer.getInteger("ical.audit.bulkEvents", 1_000);
        Room room = newOwnerRoom();
        stub.serve("/f", Feeds.manyEvents(n, inDays(1), "bulk-"));
        UUID cal = connect(room, "/f");
        long t0 = System.nanoTime();
        syncService.sync(cal);
        long first = (System.nanoTime() - t0) / 1_000_000;
        assertNull(calendarRow(cal).getLastError());
        assertEquals(n, activeRows(room).size());
        t0 = System.nanoTime();
        syncService.sync(cal);
        long second = (System.nanoTime() - t0) / 1_000_000;
        assertEquals(n, activeRows(room).size());
        assertEquals(n, eventCount(cal));
        Feeds.recordTiming(n + "-event feed: first sync " + first + " ms, unchanged resync " + second + " ms");
        assertTrue(first < n * 120L && second < n * 120L, first + " / " + second);
    }

    @Test
    void aFeedOverFiveMegabytesIsRefusedAndChangesNothing() throws Exception {
        String big = calendar(event("g1@booking.com", inDays(10), inDays(12), "Ana"),
                "X-PAD:" + "p".repeat(5 * 1024 * 1024) + "\r\n");
        Setup s = importedThenBroken(e -> StubFeedServer.respond(e, 200, big));
        syncService.sync(s.cal());
        assertFailedAndUntouched(s, "Feed exceeded size cap (5242880 bytes)");
    }

    // ---- manual sync endpoints ----------------------------------------------------------------------------

    @Test
    void manualSyncOfAFailingFeedAnswers200WithTheErrorAndThen429() throws Exception {
        Setup s = importedThenBroken(e -> StubFeedServer.respond(e, 404, "gone"));
        endCooldown(s.cal());
        String path = "/api/calendars/" + s.cal() + "/sync";

        send(post(path), s.room().token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lastError").value("Feed returned HTTP 404"))
                .andExpect(jsonPath("$.consecutiveFailures").value(1))
                .andExpect(jsonPath("$.unitName").isNotEmpty());
        int hits = stub.hits("/f");

        for (int i = 0; i < 5; i++) {
            String body = body(send(post(path), s.room().token(), null)
                    .andExpect(status().isTooManyRequests())
                    .andExpect(header().exists("Retry-After")));
            assertTrue(((String) JsonPath.read(body, "$.message")).startsWith("Synced a moment ago. Try again in "), body);
        }
        assertEquals(hits, stub.hits("/f"), "rapid repeats do not reach the feed");
        assertEquals(1, calendarRow(s.cal()).getConsecutiveFailures());
        assertEquals(s.before(), rows(s.room()));
    }

    @Test
    void syncAllRunsEveryCalendarAndReportsCounts() throws Exception {
        TestOwner owner = newOwner();
        String propertyId = createProperty(owner.token(), "Two rooms", 2);
        List<String> rooms = roomIds(owner.token(), propertyId);
        UUID ownerId = appUsers.findFirstByEmailIgnoreCase(owner.email()).orElseThrow().getOwner().getId();
        Room ok = new Room(owner, rooms.get(0), ownerId);
        Room bad = new Room(owner, rooms.get(1), ownerId);
        stub.serve("/ok", goodFeed());
        stub.handle("/bad", e -> StubFeedServer.respond(e, 500, "boom"));
        UUID okCal = connect(ok, "/ok");
        UUID badCal = connect(bad, "/bad");

        send(post("/api/calendars/sync-all"), owner.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.triggered").value(2))
                .andExpect(jsonPath("$.skipped").value(0))
                .andExpect(jsonPath("$.total").value(2));
        assertNull(calendarRow(okCal).getLastError());
        assertEquals("Feed returned HTTP 500", calendarRow(badCal).getLastError());
        assertEquals(2, activeRows(ok).size());

        // Straight away again: both are on cooldown, nothing is fetched
        int okHits = stub.hits("/ok");
        send(post("/api/calendars/sync-all"), owner.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.triggered").value(0))
                .andExpect(jsonPath("$.skipped").value(2));
        assertEquals(okHits, stub.hits("/ok"));
        send(get("/api/calendars/health"), owner.token(), null)
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(badCal.toString()));
    }

    @Test
    void anUnknownOrForeignCalendarIs404() throws Exception {
        Setup s = importedThenBroken(e -> StubFeedServer.respond(e, 500, "x"));
        TestOwner stranger = newOwner();
        send(post("/api/calendars/" + s.cal() + "/sync"), stranger.token(), null).andExpect(status().isNotFound());
        send(post("/api/calendars/" + UUID.randomUUID() + "/sync"), s.room().token(), null).andExpect(status().isNotFound());
        assertEquals(1, stub.hits("/f"), "only the initial import reached the feed");
    }
}
