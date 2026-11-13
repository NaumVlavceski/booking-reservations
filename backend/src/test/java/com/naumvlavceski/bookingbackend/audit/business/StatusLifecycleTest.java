package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Phase 3.4: statuses CONFIRMED / PAID / BLOCK / CANCELLED, every transition through PUT, and where each one shows up. */
class StatusLifecycleTest extends BusinessTestBase {

    private static final List<String> LIVE = List.of("CONFIRMED", "PAID", "BLOCK");

    @Test
    void createAcceptsEveryStatusAndDefaultsToConfirmed() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String plain = body(send(post("/api/reservations"), o.token(), reservationJson(room, "2035-01-01", "2035-01-02", null))
                .andExpect(status().isOk()));
        assertEquals("CONFIRMED", JsonPath.read(plain, "$.status"));
        assertEquals("DIRECT", JsonPath.read(plain, "$.source"));
        assertEquals(2, (int) JsonPath.read(plain, "$.guestsCount")); // default 2 guests
        int day = 2;
        for (String s : LIVE) {
            String r = body(send(post("/api/reservations"), o.token(), reservationJson(room, "2035-01-0" + day,
                    "2035-01-0" + (day + 1), "\"status\":\"" + s + "\"")).andExpect(status().isOk()));
            assertEquals(s, JsonPath.read(r, "$.status"));
            assertNull(JsonPath.read(r, "$.cancelledAt"));
            day++;
        }
        send(post("/api/reservations"), o.token(), reservationJson(room, "2035-02-01", "2035-02-02", "\"status\":\"PENDING\""))
                .andExpect(status().isBadRequest());
        send(post("/api/reservations"), o.token(), reservationJson(room, "2035-02-01", "2035-02-02", "\"status\":\"paid\""))
                .andExpect(status().isBadRequest()); // enum names are case-sensitive
    }

    /** Documents current behaviour: CANCELLED is accepted on create; the row is born cancelled and blocks nothing. */
    @Test
    void createWithCancelledMakesACancelledRowThatOccupiesNothing() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        createReservation(o.token(), room, "2035-03-01", "2035-03-05", null);
        String born = body(send(post("/api/reservations"), o.token(),
                reservationJson(room, "2035-03-02", "2035-03-04", "\"status\":\"CANCELLED\",\"guestName\":\"Born cancelled\""))
                .andExpect(status().isOk()));
        assertEquals("CANCELLED", JsonPath.read(born, "$.status"));
        assertNotNull(JsonPath.read(born, "$.cancelledAt"));
        String id = JsonPath.read(born, "$.id");
        assertFalse(getJson("/api/reservations", o.token()).contains(id));
        assertTrue(getJson("/api/reservations/cancelled", o.token()).contains(id));
        assertEquals(1, liveCount(room));
    }

    @Test
    void everyTransitionBetweenLiveStatusesWorksThroughPut() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2035-04-01", "2035-04-03", null);
        for (String from : LIVE) {
            for (String to : LIVE) {
                putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-04-01", "2035-04-03", "\"status\":\"" + from + "\""))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(from));
                putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-04-01", "2035-04-03", "\"status\":\"" + to + "\""))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(to));
            }
        }
        // without a status the current one stays
        putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-04-01", "2035-04-03", "\"status\":\"PAID\""))
                .andExpect(status().isOk());
        putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-04-01", "2035-04-04", null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));
    }

    @Test
    void cancelAndRestoreFromEveryLiveStatus() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2035-05-01", "2035-05-03", null);
        for (String from : LIVE) {
            for (String to : LIVE) {
                putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-05-01", "2035-05-03", "\"status\":\"" + from + "\""))
                        .andExpect(status().isOk());
                // cancel through PUT: 204, no body
                String empty = body(putJson("/api/reservations/" + id, o.token(),
                        reservationJson(room, "2035-05-01", "2035-05-03", "\"status\":\"CANCELLED\"")).andExpect(status().isNoContent()));
                assertEquals("", empty);
                String cancelled = getJson("/api/reservations/" + id, o.token());
                assertEquals("CANCELLED", JsonPath.read(cancelled, "$.status"));
                assertNotNull(JsonPath.read(cancelled, "$.cancelledAt"));
                // restore into any live status
                putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-05-01", "2035-05-03", "\"status\":\"" + to + "\""))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(to))
                        .andExpect(jsonPath("$.cancelledAt").doesNotExist());
            }
        }
    }

    /** Documents current behaviour: PUT with status CANCELLED only cancels; the other fields in that request are ignored. */
    @Test
    void cancellingThroughPutIgnoresTheOtherFieldsOfThatRequest() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2035-06-01", "2035-06-03", "\"notes\":\"before\"");
        putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-06-01", "2035-06-09",
                "\"status\":\"CANCELLED\",\"notes\":\"after\"")).andExpect(status().isNoContent());
        String r = getJson("/api/reservations/" + id, o.token());
        assertEquals("before", JsonPath.read(r, "$.notes"));
        assertEquals("2035-06-03", JsonPath.read(r, "$.checkOut"));
    }

    /** Documents current behaviour: editing a cancelled booking without a status keeps it cancelled and skips the overlap check. */
    @Test
    void editingACancelledBookingWithoutStatusKeepsItCancelled() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2035-07-01", "2035-07-05", null);
        send(delete("/api/reservations/" + id), o.token(), null).andExpect(status().isNoContent());
        createReservation(o.token(), room, "2035-07-01", "2035-07-05", null);
        putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-07-02", "2035-07-04",
                "\"guestName\":\"Renamed\"")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertEquals(1, liveCount(room));
    }

    @Test
    void cancelIsIdempotentAndKeepsTheFirstCancellationTime() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2035-08-01", "2035-08-03", null);
        send(delete("/api/reservations/" + id), o.token(), null).andExpect(status().isNoContent());
        String first = JsonPath.read(getJson("/api/reservations/" + id, o.token()), "$.cancelledAt");
        Thread.sleep(20);
        send(delete("/api/reservations/" + id), o.token(), null).andExpect(status().isNoContent());
        putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2035-08-01", "2035-08-03", "\"status\":\"CANCELLED\""))
                .andExpect(status().isNoContent());
        assertEquals(first, JsonPath.read(getJson("/api/reservations/" + id, o.token()), "$.cancelledAt"));
        send(delete("/api/reservations/00000000-0000-0000-0000-000000000001"), o.token(), null).andExpect(status().isNotFound());
    }

    @Test
    void blockedDatesAreExportedToTheFeedAndCancelledOnesAreNot() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String feed = JsonPath.read(getJson("/api/units/" + room, o.token()), "$.token");
        send(post("/api/reservations"), o.token(), "{\"unitId\":\"" + room + "\",\"checkIn\":\"2035-09-01\",\"checkOut\":\"2035-09-04\",\"status\":\"BLOCK\"}")
                .andExpect(status().isOk());
        createReservation(o.token(), room, "2035-09-10", "2035-09-12", "\"status\":\"PAID\",\"guestName\":\"Paid Guest\"");
        String gone = createReservation(o.token(), room, "2035-09-20", "2035-09-22", "\"guestName\":\"Gone Guest\"");
        send(delete("/api/reservations/" + gone), o.token(), null).andExpect(status().isNoContent());
        createReservation(o.token(), room, "2035-09-20", "2035-09-21", "\"status\":\"CANCELLED\",\"guestName\":\"Born Cancelled\"");

        String ics = body(mvc.perform(get("/api/ical/" + feed + ".ics")).andExpect(status().isOk()));
        assertTrue(ics.contains("DTSTART;VALUE=DATE:20350901\r\nDTEND;VALUE=DATE:20350904\r\nSUMMARY:Reserved"), ics);
        assertTrue(ics.contains("SUMMARY:Paid Guest"), ics);
        assertFalse(ics.contains("Gone Guest") || ics.contains("Born Cancelled") || ics.contains("20350920"), ics);
        assertEquals(2, ics.split("BEGIN:VEVENT", -1).length - 1);
    }

    @Test
    void invoicesCountOnlyConfirmedAndPaid() throws Exception {
        TestOwner o = newOwner();
        String property = createProperty(o.token(), "Statuses", 1);
        String room = roomIds(o.token(), property).getFirst();
        createReservation(o.token(), room, "2035-10-01", "2035-10-02", "\"totalAmount\":100");
        createReservation(o.token(), room, "2035-10-02", "2035-10-04", "\"status\":\"PAID\",\"totalAmount\":200");
        createReservation(o.token(), room, "2035-10-04", "2035-10-07", "\"status\":\"BLOCK\",\"totalAmount\":300");
        String c = createReservation(o.token(), room, "2035-10-07", "2035-10-11", "\"totalAmount\":400");
        send(delete("/api/reservations/" + c), o.token(), null);
        createReservation(o.token(), room, "2035-10-07", "2035-10-08", "\"status\":\"CANCELLED\",\"totalAmount\":500");

        String inv = getJson("/api/invoices/properties/" + property + "/units", o.token());
        assertEquals(0, decAt(inv, "$.grandTotal.earnings").compareTo(new java.math.BigDecimal("300.00")));
        assertEquals(2, (int) JsonPath.read(inv, "$.grandTotal.reservationCount"));
        assertEquals(3, (int) JsonPath.read(inv, "$.grandTotal.totalDays"));
        send(get("/api/invoices/properties/" + property + "/units?status=BLOCK"), o.token(), null).andExpect(status().isBadRequest());
        send(get("/api/invoices/properties/" + property + "/units?status=CANCELLED"), o.token(), null).andExpect(status().isBadRequest());
        String unitList = getJson("/api/invoices/units/" + room + "/reservations", o.token());
        assertEquals(List.of("PAID", "CONFIRMED"), JsonPath.read(unitList, "$.reservations.items[*].status"));
    }

    @Test
    void cancelledBookingsAreListedOnlyWhereAskedFor() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2035-11-01", "2035-11-03", "\"guestName\":\"Listed\"");
        send(delete("/api/reservations/" + id), o.token(), null);
        assertFalse(getJson("/api/reservations", o.token()).contains(id));
        assertFalse(getJson("/api/reservations?unitId=" + room, o.token()).contains(id));
        assertTrue(getJson("/api/reservations/cancelled?name=list", o.token()).contains(id));
        // explicitly asked for, and in the per-unit list (which includes cancelled ones by design)
        assertTrue(getJson("/api/reservations?status=CANCELLED", o.token()).contains(id));
        assertTrue(getJson("/api/reservations/" + room + "/unit", o.token()).contains(id));
    }
}
