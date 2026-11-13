package com.naumvlavceski.bookingbackend.audit.ical;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ExternalEvent;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.calendar;
import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.event;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The real fetch → parse → reconcile path (IcalSyncService) against Postgres, with feeds served from 127.0.0.1. */
class IcalSyncE2eAuditTest extends IcalAuditSupport {

    private static final String IMPORTED = "EXTERNAL_RESERVATION_IMPORTED";
    private static final String MODIFIED = "EXTERNAL_RESERVATION_MODIFIED";
    private static final String CANCELLED = "EXTERNAL_RESERVATION_CANCELLED";
    private static final String CONFLICT = "BOOKING_CONFLICT";
    private static final String CONFLICT_CHANGED = "BOOKING_CONFLICT_CHANGED";

    private static LocalDate day(Map<String, Object> row, String col) {
        return ((Date) row.get(col)).toLocalDate();
    }

    // ---- idempotency and the shape of imported rows -------------------------------------------------------

    @Test
    void syncingTheSameFeedTwiceCreatesNoDuplicates() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(
                event("1001@booking.com", inDays(10), inDays(13), "CLOSED - Not available"),
                event("1002@booking.com", inDays(20), inDays(22), "Марија Петровска")));
        UUID cal = connect(room, "/f");

        syncService.sync(cal);
        syncService.sync(cal);
        syncService.sync(cal);

        List<Map<String, Object>> rows = rows(room);
        assertEquals(2, rows.size(), rows::toString);
        assertEquals(2, eventCount(cal));
        for (Map<String, Object> r : rows) {
            assertEquals("CONFIRMED", r.get("status"));
            assertEquals("BOOKING", r.get("source"));
            assertNull(r.get("total_amount"), "imported bookings carry no amount");
            assertNull(r.get("nightly_rate"));
            assertNull(r.get("price_per_guest"));
            assertEquals(2, r.get("guests_count"), "iCal has no guest count: 2 is assumed");
        }
        assertEquals("CLOSED - Not available", rows.get(0).get("guest_name"), "S15: the feed title becomes the guest name");
        assertEquals("Марија Петровска", rows.get(1).get("guest_name"));

        ExternalCalendar c = calendarRow(cal);
        assertNull(c.getLastError());
        assertEquals(0, c.getConsecutiveFailures());
        assertNotNull(c.getLastSuccessAt());
        assertEquals(3, stub.hits("/f"));
        settle();
        assertEquals(0, emails(room.ownerId(), IMPORTED), "the first import of a feed is not news");
    }

    @Test
    void importedRowsAreVisibleThroughTheApiAsBookingCom() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("api@booking.com", inDays(5), inDays(7), "CLOSED - Not available")));
        syncService.sync(connect(room, "/f"));
        send(get("/api/reservations?unitId=" + room.roomId()), room.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].source").value("BOOKING"))
                .andExpect(jsonPath("$[0].totalAmount").doesNotExist())
                .andExpect(jsonPath("$[0].guestName").value("CLOSED - Not available"));
    }

    @Test
    void aNewEventInALaterSyncIsImportedAndEmailed() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("a@booking.com", inDays(10), inDays(12), "A")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);

        stub.serve("/f", calendar(event("a@booking.com", inDays(10), inDays(12), "A"),
                event("b@booking.com", inDays(30), inDays(33), "B")));
        syncService.sync(cal);

        assertEquals(2, activeRows(room).size());
        assertEquals(1, awaitEmails(room.ownerId(), IMPORTED, 1));
        settle();
        assertEquals(1, emails(room.ownerId(), IMPORTED));
    }

    @Test
    void changedDatesUpdateTheSameReservation() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("m@booking.com", inDays(10), inDays(13), "Ana")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        UUID id = (UUID) rows(room).getFirst().get("id");

        stub.serve("/f", calendar(event("m@booking.com", inDays(11), inDays(15), "Ana")));
        syncService.sync(cal);

        List<Map<String, Object>> rows = rows(room);
        assertEquals(1, rows.size());
        assertEquals(id, rows.getFirst().get("id"), "same reservation, not a new one");
        assertEquals(inDays(11), day(rows.getFirst(), "check_in"));
        assertEquals(inDays(15), day(rows.getFirst(), "check_out"));
        assertEquals(1, awaitEmails(room.ownerId(), MODIFIED, 1));
    }

    @Test
    void aDateChangeAfterTheOwnerEnteredAnAmountFlagsThePrice() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("p@booking.com", inDays(10), inDays(13), "Ana")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        UUID id = (UUID) rows(room).getFirst().get("id");
        jdbc.update("update reservation set total_amount = 300 where id = ?", id);

        stub.serve("/f", calendar(event("p@booking.com", inDays(10), inDays(14), "Ana")));
        syncService.sync(cal);

        Map<String, Object> row = rows(room).getFirst();
        assertEquals(0, new BigDecimal("300.00").compareTo((BigDecimal) row.get("total_amount")), "amount kept");
        assertEquals(true, row.get("price_needs_review"));
    }

    // ---- removal: the documented safety rule --------------------------------------------------------------

    @Test
    void aRemovedEventIsCancelledOnlyAfterThreeSyncsAndOneHour() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("keep@booking.com", inDays(40), inDays(42), "Keep"),
                event("gone@booking.com", inDays(10), inDays(12), "Gone")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        stub.serve("/f", calendar(event("keep@booking.com", inDays(40), inDays(42), "Keep")));

        for (int i = 1; i <= 4; i++) {
            syncService.sync(cal);
            assertEquals(2, activeRows(room).size(), "sync " + i + " within the hour must not cancel");
        }
        ExternalEvent gone = events.findByExternalCalendarIdAndUid(cal, "gone@booking.com").orElseThrow();
        assertEquals(4, gone.getMissingSyncs());

        // An hour passes (the reconciler uses Instant.now(), so the stored timestamp is moved back instead)
        backdateMissing(cal, "gone@booking.com", Duration.ofMinutes(61));
        syncService.sync(cal);

        List<Map<String, Object>> active = activeRows(room);
        assertEquals(1, active.size());
        assertEquals("Keep", active.getFirst().get("guest_name"));
        assertEquals(1, awaitEmails(room.ownerId(), CANCELLED, 1));
    }

    @Test
    void anHourIsNotEnoughWithFewerThanThreeMissingSyncs() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("keep@booking.com", inDays(40), inDays(42), "Keep"),
                event("gone@booking.com", inDays(10), inDays(12), "Gone")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        stub.serve("/f", calendar(event("keep@booking.com", inDays(40), inDays(42), "Keep")));
        syncService.sync(cal);
        backdateMissing(cal, "gone@booking.com", Duration.ofHours(5));
        syncService.sync(cal); // 2nd missing sync, 5 h missing
        assertEquals(2, activeRows(room).size());
        syncService.sync(cal); // 3rd
        assertEquals(1, activeRows(room).size());
    }

    @Test
    void anEventThatComesBackBeforeTheDeadlineResetsTheCount() throws Exception {
        Room room = newOwnerRoom();
        String both = calendar(event("keep@booking.com", inDays(40), inDays(42), "Keep"),
                event("flaky@booking.com", inDays(10), inDays(12), "Flaky"));
        stub.serve("/f", both);
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        stub.serve("/f", calendar(event("keep@booking.com", inDays(40), inDays(42), "Keep")));
        syncService.sync(cal);
        syncService.sync(cal);
        stub.serve("/f", both);
        syncService.sync(cal);
        ExternalEvent flaky = events.findByExternalCalendarIdAndUid(cal, "flaky@booking.com").orElseThrow();
        assertEquals(0, flaky.getMissingSyncs());
        assertNull(flaky.getMissingSince());
        assertEquals(2, activeRows(room).size());
    }

    @Test
    void anEmptyFeedWaitsSixHoursBeforeCancelling() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("e@booking.com", inDays(10), inDays(12), "E")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        stub.serve("/f", calendar());
        for (int i = 0; i < 3; i++) syncService.sync(cal);
        backdateMissing(cal, "e@booking.com", Duration.ofHours(5));
        syncService.sync(cal);
        assertEquals(1, activeRows(room).size(), "5 h is not enough for an empty feed");
        backdateMissing(cal, "e@booking.com", Duration.ofHours(6).plusMinutes(1));
        syncService.sync(cal);
        assertEquals(0, activeRows(room).size());
    }

    @Test
    void aStayThatHasEndedIsNeverCancelledByTheFeed() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("past@booking.com", inDays(-10), inDays(-7), "Past"),
                event("now@booking.com", inDays(-1), inDays(0), "Left today")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        stub.serve("/f", calendar(event("other@booking.com", inDays(50), inDays(52), "Other")));
        for (int i = 0; i < 4; i++) syncService.sync(cal);
        jdbc.update("update external_event set missing_since = now() - interval '30 days' where external_calendar_id = ?", cal);
        syncService.sync(cal);
        assertEquals(3, activeRows(room).size(), "past stays stay; checkout today counts as ended");
    }

    @Test
    void aPartialReadCancelsNothing() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("x@booking.com", inDays(10), inDays(12), "X")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        // X is gone, but one entry has no UID: it might be X
        stub.serve("/f", calendar(event(null, inDays(70), inDays(72), "No uid")));
        for (int i = 0; i < 5; i++) syncService.sync(cal);
        backdateMissing(cal, "x@booking.com", Duration.ofDays(2));
        syncService.sync(cal);
        assertEquals(1, activeRows(room).size());
        assertEquals("1 entry in this calendar could not be read and was skipped.", calendarRow(cal).getLastError());
    }

    private void backdateMissing(UUID cal, String uid, Duration ago) {
        ExternalEvent e = events.findByExternalCalendarIdAndUid(cal, uid).orElseThrow();
        e.setMissingSince(Instant.now().minus(ago));
        events.save(e);
    }

    // ---- S2: an owner-cancelled import comes back ---------------------------------------------------------

    // Finding ICAL-01, owner's decision (2026-11-12): a booking Booking.com still lists is cancelled on Booking.com,
    // not in RoomTrack. Before the fix, cancelling it here worked and the next sync silently made it CONFIRMED again.
    @Test
    void anImportStillListedOnBookingComCannotBeCancelledHere() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("s2@booking.com", inDays(10), inDays(13), "CLOSED - Not available")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        String id = rows(room).getFirst().get("id").toString();

        send(delete("/api/reservations/" + id), room.token(), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHANNEL_BOOKING"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Cancel it on Booking.com")));
        send(put("/api/reservations/" + id), room.token(), reservationJson(room.roomId(), inDays(10).toString(),
                inDays(13).toString(), "\"status\":\"CANCELLED\""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHANNEL_BOOKING"));
        assertEquals("CONFIRMED", reservation(UUID.fromString(id)).get("status"));

        syncService.sync(cal); // the feed is unchanged: nothing to undo and nothing to report
        assertEquals("CONFIRMED", reservation(UUID.fromString(id)).get("status"));
        send(get("/api/conflicts"), room.token(), null).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void onceBookingComDropsTheEventTheOwnerCanCancelItAtOnce() throws Exception {
        // The automatic cancel waits for 3 syncs and an hour; an owner who saw the cancellation on Booking.com need not
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("s2b@booking.com", inDays(10), inDays(13), "CLOSED - Not available"),
                event("s2c@booking.com", inDays(30), inDays(32), "CLOSED - Not available")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        String id = rows(room).getFirst().get("id").toString(); // ordered by check-in: the stay in 10 days

        stub.serve("/f", calendar(event("s2c@booking.com", inDays(30), inDays(32), "CLOSED - Not available")));
        syncService.sync(cal); // now missing from the feed, not yet cancelled automatically
        assertEquals("CONFIRMED", reservation(UUID.fromString(id)).get("status"));

        send(delete("/api/reservations/" + id), room.token(), null).andExpect(status().isNoContent());
        assertEquals("CANCELLED", reservation(UUID.fromString(id)).get("status"));
    }

    // ---- conflicts with direct bookings -------------------------------------------------------------------

    @Test
    void anOverlapWithADirectBookingBecomesAConflictAndOverwritesNothing() throws Exception {
        Room room = newOwnerRoom();
        String direct = createReservation(room.token(), room.roomId(), inDays(10).toString(), inDays(14).toString(),
                "\"totalAmount\":400,\"notes\":\"paid cash\"");
        Map<String, Object> before = reservation(UUID.fromString(direct));
        stub.serve("/f", calendar(event("clash@booking.com", inDays(12), inDays(15), "Booking Guest")));
        UUID cal = connect(room, "/f");

        syncService.sync(cal);

        assertEquals(before, reservation(UUID.fromString(direct)), "the direct booking is untouched");
        assertEquals(1, rows(room).size(), "no imported reservation was created");
        String json = body(send(get("/api/conflicts"), room.token(), null).andExpect(status().isOk()));
        assertEquals(1, (int) JsonPath.read(json, "$.length()"));
        assertEquals("NEW_OVERLAP", JsonPath.read(json, "$[0].kind"));
        assertEquals(direct, JsonPath.read(json, "$[0].conflictingReservationId"));
        assertEquals(inDays(12).toString(), JsonPath.read(json, "$[0].incomingStart"));
        assertEquals("Booking Guest", JsonPath.read(json, "$[0].incomingSummary"));
        assertEquals("BOOKING", JsonPath.read(json, "$[0].platform"));
        assertEquals(1, awaitEmails(room.ownerId(), CONFLICT, 1));
        assertNull(calendarRow(cal).getLastError(), "a conflict is not a sync error");

        // Repeated syncs: still one conflict, no second email
        syncService.sync(cal);
        syncService.sync(cal);
        send(get("/api/conflicts"), room.token(), null).andExpect(jsonPath("$.length()").value(1));
        settle();
        assertEquals(1, emails(room.ownerId(), CONFLICT));

        // The event leaves the feed: the conflict resolves by itself, the direct booking is still untouched
        stub.serve("/f", calendar(event("other@booking.com", inDays(40), inDays(41), "Other")));
        syncService.sync(cal);
        send(get("/api/conflicts"), room.token(), null).andExpect(jsonPath("$.length()").value(0));
        assertEquals("RESOLVED", conflicts.findByExternalCalendarIdAndExternalUid(cal, "clash@booking.com")
                .orElseThrow().getStatus().name());
        assertEquals(before, reservation(UUID.fromString(direct)));
    }

    @Test
    void aConflictIsImportedOnceTheDirectBookingIsCancelled() throws Exception {
        Room room = newOwnerRoom();
        String direct = createReservation(room.token(), room.roomId(), inDays(10).toString(), inDays(14).toString(), null);
        stub.serve("/f", calendar(event("later@booking.com", inDays(12), inDays(15), "Booking Guest")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        send(delete("/api/reservations/" + direct), room.token(), null).andExpect(status().isNoContent());

        syncService.sync(cal);

        List<Map<String, Object>> active = activeRows(room);
        assertEquals(1, active.size());
        assertEquals("BOOKING", active.getFirst().get("source"));
        send(get("/api/conflicts"), room.token(), null).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void aDateChangeOntoADirectBookingIsAChangeConflictAndKeepsBothAsTheyWere() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("mv@booking.com", inDays(10), inDays(12), "Ana")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        UUID imported = (UUID) rows(room).getFirst().get("id");
        String direct = createReservation(room.token(), room.roomId(), inDays(20).toString(), inDays(23).toString(), null);

        stub.serve("/f", calendar(event("mv@booking.com", inDays(19), inDays(21), "Ana")));
        syncService.sync(cal);

        assertEquals(inDays(10), day(reservation(imported), "check_in"), "the import keeps its old dates");
        assertEquals(inDays(20), day(reservation(UUID.fromString(direct)), "check_in"));
        send(get("/api/conflicts"), room.token(), null)
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].kind").value("CHANGE_OVERLAP"));
        assertEquals(1, awaitEmails(room.ownerId(), CONFLICT_CHANGED, 1));
    }

    @Test
    void noConflictEmailWhenNotificationsAreOff() throws Exception {
        Room room = newOwnerRoom();
        send(put("/api/notifications/settings"), room.token(), "{\"enabled\":false}");
        boolean off = Boolean.FALSE.equals(jdbc.queryForObject(
                "select notifications_enabled from owner where id = ?", Boolean.class, room.ownerId()));
        org.junit.jupiter.api.Assumptions.assumeTrue(off, "could not switch notifications off through the API");
        createReservation(room.token(), room.roomId(), inDays(10).toString(), inDays(14).toString(), null);
        stub.serve("/f", calendar(event("quiet@booking.com", inDays(12), inDays(15), "B")));
        syncService.sync(connect(room, "/f"));
        send(get("/api/conflicts"), room.token(), null).andExpect(jsonPath("$.length()").value(1));
        settle();
        assertEquals(0, emails(room.ownerId(), CONFLICT));
    }

    // ---- invoices and reports -----------------------------------------------------------------------------

    @Test
    void importedBookingsCountInInvoicesAsBookingsWithoutAnAmount() throws Exception {
        Room room = newOwnerRoom();
        String propertyId = jdbc.queryForObject("select property_id from unit where id = ?", UUID.class, room.unitId()).toString();
        createReservation(room.token(), room.roomId(), inDays(30).toString(), inDays(32).toString(), "\"totalAmount\":200");
        stub.serve("/f", calendar(event("inv1@booking.com", inDays(10), inDays(13), "CLOSED - Not available"),
                event("inv2@booking.com", inDays(20), inDays(21), "Ana")));
        syncService.sync(connect(room, "/f"));

        send(get("/api/invoices/properties/" + propertyId + "/units"), room.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grandTotal.reservationCount").value(3))
                .andExpect(jsonPath("$.grandTotal.totalDays").value(3 + 1 + 2))
                .andExpect(jsonPath("$.grandTotal.earnings").value(200.0))
                .andExpect(jsonPath("$.grandTotal.reservationsWithoutAmount").value(2));
        send(get("/api/invoices/properties/" + propertyId + "/units?source=BOOKING"), room.token(), null)
                .andExpect(jsonPath("$.grandTotal.reservationCount").value(2))
                .andExpect(jsonPath("$.grandTotal.earnings").value(0.0));
        send(get("/api/invoices/properties/" + propertyId + "/missing-amounts"), room.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reservations.totalElements").value(2))
                .andExpect(jsonPath("$.reservations.items[*].source").value(org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.is("BOOKING"))));
        send(get("/api/invoices/units/" + room.roomId() + "/reservations"), room.token(), null)
                .andExpect(jsonPath("$.reservationCount").value(3))
                .andExpect(jsonPath("$.reservationsWithoutAmount").value(2));
    }

    // ---- reconnect, echo, duplicates, STATUS:CANCELLED ----------------------------------------------------

    @Test
    void reconnectingTheSameFeedRelinksInsteadOfDuplicating() throws Exception {
        Room room = newOwnerRoom();
        String feed = calendar(event("r1@booking.com", inDays(10), inDays(12), "A"),
                event("r2@booking.com", inDays(20), inDays(22), "B"));
        stub.serve("/f", feed);
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        send(delete("/api/calendars/" + cal), room.token(), null).andExpect(status().isNoContent());
        assertEquals(2, activeRows(room).size(), "disconnecting keeps the bookings");

        UUID again = connect(room, "/f");
        syncService.sync(again);

        assertEquals(2, activeRows(room).size());
        assertEquals(2, eventCount(again));
        send(get("/api/conflicts"), room.token(), null).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void ourOwnExportedEventsEchoedBackAreIgnored() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("abc@roomtrack", inDays(10), inDays(12), "Reserved"),
                event("old@staytrack", inDays(20), inDays(22), "Reserved")));
        syncService.sync(connect(room, "/f"));
        assertEquals(0, rows(room).size());
    }

    // Finding ICAL-05: two events with the same UID in one feed flip the booking between their dates on every sync.
    @Tag("open-finding")
    @Test
    void anUnchangedFeedWithADuplicateUidDoesNotEmailOnEverySync() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("dup@booking.com", inDays(10), inDays(12), "First"),
                event("dup@booking.com", inDays(30), inDays(32), "Second")));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        settle();
        long afterFirst = emails(room.ownerId(), MODIFIED);

        syncService.sync(cal);
        syncService.sync(cal);
        settle();

        assertEquals(1, activeRows(room).size());
        assertEquals(afterFirst, emails(room.ownerId(), MODIFIED),
                "the feed did not change, yet 'booking changed' emails were sent");
    }

    // Finding ICAL-04: an event marked STATUS:CANCELLED is imported as a confirmed booking.
    @Tag("open-finding")
    @Test
    void aCancelledEventInTheFeedDoesNotBlockTheRoom() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("st@booking.com", inDays(10), inDays(12), "Ana", "STATUS:CANCELLED\r\n")));
        syncService.sync(connect(room, "/f"));
        assertEquals(0, activeRows(room).size(), "a cancelled event became a CONFIRMED booking that blocks the nights");
    }

    @Test
    void aWarningIsShownWhenEntriesWereSkipped() throws Exception {
        Room room = newOwnerRoom();
        stub.serve("/f", calendar(event("ok@booking.com", inDays(10), inDays(12), "Ok"),
                event("bad@booking.com", inDays(20), inDays(18), "Backwards"),
                "BEGIN:VEVENT\r\nUID:dur@booking.com\r\nDTSTART;VALUE=DATE:" + Feeds.date(inDays(40))
                        + "\r\nDURATION:P2D\r\nEND:VEVENT\r\n"));
        UUID cal = connect(room, "/f");
        syncService.sync(cal);
        assertEquals(1, activeRows(room).size());
        assertEquals("2 entries in this calendar could not be read and were skipped.", calendarRow(cal).getLastError());
        send(get("/api/calendars/health"), room.token(), null)
                .andExpect(jsonPath("$[?(@.id=='" + cal + "')]").isNotEmpty());
    }
}
