package com.naumvlavceski.bookingbackend.audit.ical;

import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.calendar;
import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.event;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** A3 against the real sync: tracking fields on success and on failure, without touching the owner's last_error. */
class SyncTrackingAuditTest extends IcalAuditSupport {

    @Test
    void successThenFailureThenSuccess() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/t", calendar(event("t1@booking.com", inDays(5), inDays(7), "Ana")));
        UUID cal = connect(room, "/t");

        syncService.sync(cal);
        ExternalCalendar ok = calendarRow(cal);
        assertNotNull(ok.getLastSuccessAt());
        assertEquals(ok.getLastSyncedAt(), ok.getLastSuccessAt());
        assertEquals(0, ok.getConsecutiveFailures());
        assertNull(ok.getLastErrorAt());
        assertNull(ok.getLastErrorMessage());

        stub.handle("/t", e -> StubFeedServer.respond(e, 500, "boom"));
        syncService.sync(cal);
        ExternalCalendar failed = calendarRow(cal);
        assertEquals(1, failed.getConsecutiveFailures());
        assertEquals(failed.getLastSyncedAt(), failed.getLastErrorAt());
        assertEquals("Feed returned HTTP 500", failed.getLastErrorMessage());
        assertEquals("Feed returned HTTP 500", failed.getLastError(), "owner-facing text unchanged");
        assertFalse(failed.getLastErrorMessage().contains("127.0.0.1"));

        stub.serve("/t", calendar(event("t1@booking.com", inDays(5), inDays(7), "Ana")));
        syncService.sync(cal);
        ExternalCalendar recovered = calendarRow(cal);
        assertEquals(0, recovered.getConsecutiveFailures());
        assertTrue(recovered.getLastSuccessAt().isAfter(recovered.getLastErrorAt()), "error history is kept");
    }
}
