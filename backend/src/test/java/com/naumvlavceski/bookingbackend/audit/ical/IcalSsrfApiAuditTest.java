package com.naumvlavceski.bookingbackend.audit.ical;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.calendar;
import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.event;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SSRF through the real endpoint POST /api/units/{id}/calendars, and at sync time. Every payload here is refused
 * before any DNS lookup of a booking.com name (scheme, allow-list or size), so nothing leaves the machine.
 */
class IcalSsrfApiAuditTest extends IcalAuditSupport {

    static final List<String> PAYLOADS = List.of(
            "https://localhost/a.ics", "https://127.0.0.1/a.ics", "https://127.1/a.ics", "https://0x7f000001/a.ics",
            "https://2130706433/a.ics", "https://[::1]/a.ics", "https://[::ffff:127.0.0.1]/a.ics", "https://0.0.0.0/a.ics",
            "https://10.0.0.1/a.ics", "https://172.16.0.1/a.ics", "https://192.168.1.1/a.ics",
            "https://169.254.169.254/latest/meta-data/", "https://100.64.0.1/a.ics", "https://198.18.0.1/a.ics",
            "https://240.0.0.1/a.ics", "https://[64:ff9b::7f00:1]/a.ics", "https://[fd00::1]/a.ics",
            "file:///etc/passwd", "gopher://127.0.0.1:6379/_INFO", "ftp://ical.booking.com/a.ics",
            "http://ical.booking.com/v1/export?t=a", "webcal://127.0.0.1/a.ics", "dict://127.0.0.1:11211/stat",
            "https://booking.com@127.0.0.1/a.ics", "https://ical.booking.com:443@127.0.0.1/a.ics",
            "https://127.0.0.1\\\\@ical.booking.com/a.ics", "https://ical.booking.com\\\\.evil.com/a.ics",
            "https://127.0.0.1#.booking.com", "https://127.0.0.1/?x=.booking.com",
            "https://booking.com.evil.com/a.ics", "https://ical.booking.com.evil.com/a.ics", "https://evilbooking.com/a.ics",
            "https://bооking.com/a.ics", "https://xn--bking-gxa.com/a.ics", "https://ical.booking.com./a.ics",
            "https://www.airbnb.com/calendar/ical/123.ics?s=abc", "//ical.booking.com/a.ics", "https:///a.ics",
            "javascript:alert(1)", "data:text/calendar,BEGIN:VCALENDAR",
            "https://ical.booking.com/" + "a".repeat(1_000),   // over the 1000-character limit
            "https://evil.example/" + "a".repeat(5_000));

    @Test
    void everySsrfPayloadIsRefusedAndNothingIsStored() throws Exception {
        Room room = newOwnerRoom();
        String path = "/api/units/" + room.roomId() + "/calendars";
        int refused = 0;
        for (String url : PAYLOADS) {
            var res = send(post(path), room.token(), "{\"icsUrl\":\"" + url + "\"}").andReturn().getResponse();
            assertEquals(400, res.getStatus(), url + " -> " + res.getContentAsString());
            String message = JsonPath.read(res.getContentAsString(), "$.message");
            assertNotNull(message, url);
            assertFalse(message.contains("Exception"), url + ": " + message);
            refused++;
        }
        assertEquals(PAYLOADS.size(), refused);
        assertTrue(calendars.findAllByUnitId(room.unitId()).isEmpty(), "no calendar row may be stored");
        Feeds.recordTiming("SSRF payloads refused through POST /api/units/{id}/calendars: " + refused);
    }

    @Test
    void schemeErrorsOnBookingHostsAreExplained() throws Exception {
        Room room = newOwnerRoom();
        String path = "/api/units/" + room.roomId() + "/calendars";
        for (String url : List.of("http://ical.booking.com/v1/export?t=a", "ftp://ical.booking.com/a.ics", "//ical.booking.com/a.ics")) {
            String body = body(send(post(path), room.token(), "{\"icsUrl\":\"" + url + "\"}"));
            assertEquals("Feed URL must be a valid https address", JsonPath.read(body, "$.message"), url);
        }
        String body = body(send(post(path), room.token(), "{\"icsUrl\":\"https://127.0.0.1/a.ics\"}"));
        assertEquals("Only Booking.com calendar links are supported.", JsonPath.read(body, "$.message"));
    }

    // Finding ICAL-03 (S7), FIXED (IcalFetchGuard in IcalSyncService): regression test. Before the fix the guard ran
    // only when a link was connected, never when it was fetched.
    @Test
    void aStoredPrivateUrlIsNotFetchedAtSyncTime() throws Exception {
        fetchGuard.allowLoopbackStubsInTests(false); // production behaviour for this test
        Room room = newOwnerRoom();
        // A row that did not pass today's checks: a legacy row, a manual DB fix, or a name that now resolves privately
        stub.serve("/internal", calendar(event("ssrf@booking.com", inDays(10), inDays(12), "fetched from 127.0.0.1")));
        UUID cal = connectUrl(room, stub.url("/internal"));

        syncService.sync(cal);

        assertEquals(0, stub.hits("/internal"), "the sync requested a loopback http URL without re-checking it");
        assertTrue(rows(room).isEmpty());
        assertNotNull(calendarRow(cal).getLastError());
    }
}
