package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Phase 3.5 and 3.6: move, copy, cancel, and guests vs room capacity. */
class MoveCopyCancelTest extends BusinessTestBase {

    private static final String FULL = "\"status\":\"PAID\",\"guestName\":\"Ana Petrova\",\"guestEmail\":\"ana@example.test\","
            + "\"guestPhone\":\"+389 70 000 000\",\"guestsCount\":3,\"notes\":\"Late arrival\","
            + "\"pricePerGuest\":20.00,\"nightlyRate\":60.00,\"totalAmount\":240.00";

    private String move(String token, String id, String unit) throws Exception {
        return "{\"unitId\":\"" + unit + "\"}";
    }

    @Test
    void aBookingFromBookingComCannotBeMovedNeitherByMoveNorByEditingTheRoom() throws Exception {
        // Owner's decision (2026-11-13): a channel booking stays in the room the channel booked
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Channel", 2));
        String a = createReservation(o.token(), rooms.get(0), "2036-03-10", "2036-03-12", null);
        jdbc.update("update reservation set source = 'BOOKING' where id = ?::uuid", a);

        send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, rooms.get(1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("A booking from Booking.com can't be moved to another room. Change it on Booking.com."));
        putJson("/api/reservations/" + a, o.token(), reservationJson(rooms.get(1), "2036-03-10", "2036-03-12", null))
                .andExpect(status().isBadRequest());
        assertEquals(rooms.get(0), JsonPath.read(getJson("/api/reservations/" + a, o.token()), "$.unitId"));

        // Editing it in its own room still works (e.g. adding a price), and Direct bookings still move
        putJson("/api/reservations/" + a, o.token(), reservationJson(rooms.get(0), "2036-03-10", "2036-03-12", "\"totalAmount\":120"))
                .andExpect(status().isOk());
        String direct = createReservation(o.token(), rooms.get(0), "2036-04-10", "2036-04-12", null);
        send(post("/api/reservations/" + direct + "/move"), o.token(), move(o.token(), direct, rooms.get(1)))
                .andExpect(status().isOk());
    }

    @Test
    void moveToAnOccupiedRoomIsRefusedAndNothingChanges() throws Exception {
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Two", 2));
        String a = createReservation(o.token(), rooms.get(0), "2036-01-10", "2036-01-14", null);
        createReservation(o.token(), rooms.get(1), "2036-01-13", "2036-01-15", null);
        send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, rooms.get(1)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DATES_TAKEN"))
                .andExpect(jsonPath("$.room").value("Room 2"));
        assertEquals(rooms.get(0), JsonPath.read(getJson("/api/reservations/" + a, o.token()), "$.unitId"));
        // and the move options say so beforehand
        assertEquals("[]", JsonPath.read(getJson("/api/reservations/" + a + "/available-options", o.token()), "$").toString());
    }

    @Test
    void moveToAFreeRoomChangesOnlyTheRoom() throws Exception {
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Three", 3));
        String a = createReservation(o.token(), rooms.get(0), "2036-02-10", "2036-02-14", FULL);
        String before = getJson("/api/reservations/" + a, o.token());
        List<String> options = JsonPath.read(getJson("/api/reservations/" + a + "/available-options", o.token()), "$[*].unitId");
        assertEquals(java.util.Set.of(rooms.get(1), rooms.get(2)), new java.util.HashSet<>(options));

        String moved = body(send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, rooms.get(2)))
                .andExpect(status().isOk()));
        String after = getJson("/api/reservations/" + a, o.token());
        for (String field : List.of("id", "checkIn", "checkOut", "status", "source", "guestName", "guestEmail", "guestPhone",
                "guestsCount", "pricePerGuest", "nightlyRate", "totalAmount", "notes", "priceNeedsReview", "cancelledAt")) {
            Object was = JsonPath.read(before, "$." + field);
            assertEquals(String.valueOf(was), String.valueOf(JsonPath.<Object>read(after, "$." + field)), field);
            assertEquals(String.valueOf(was), String.valueOf(JsonPath.<Object>read(moved, "$." + field)), field);
        }
        assertEquals(rooms.get(2), JsonPath.read(after, "$.unitId"));
        assertEquals(0, liveCount(rooms.get(0)));
    }

    @Test
    void moveIsLimitedToOtherRoomsOfTheSameProperty() throws Exception {
        TestOwner o = newOwner();
        String room = roomIds(o.token(), createProperty(o.token(), "Here", 1)).getFirst();
        String elsewhere = roomIds(o.token(), createProperty(o.token(), "There", 1)).getFirst();
        String a = createReservation(o.token(), room, "2036-03-01", "2036-03-03", null);
        send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, elsewhere))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("A booking can only be moved to a room in the same property"));
        send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, room))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("The booking is already in this room"));
        send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, "00000000-0000-0000-0000-000000000009"))
                .andExpect(status().isNotFound());
        TestOwner b = newOwner();
        send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, newRoom(b.token())))
                .andExpect(status().isNotFound()); // another owner's room looks unknown
        send(delete("/api/reservations/" + a), o.token(), null);
        send(post("/api/reservations/" + a + "/move"), o.token(), move(o.token(), a, elsewhere))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("A cancelled booking can't be moved"));
        assertEquals("[]", JsonPath.read(getJson("/api/reservations/" + a + "/available-options", o.token()), "$").toString());
    }

    // Finding BIZ-06: PUT can put a booking into a room of ANOTHER property, although /move refuses exactly that.
    @Tag("open-finding")
    @Test
    void putCannotMoveABookingToAnotherPropertysRoom() throws Exception {
        TestOwner o = newOwner();
        String room = roomIds(o.token(), createProperty(o.token(), "Here", 1)).getFirst();
        String elsewhere = roomIds(o.token(), createProperty(o.token(), "There", 1)).getFirst();
        String a = createReservation(o.token(), room, "2036-04-01", "2036-04-03", null);
        putJson("/api/reservations/" + a, o.token(), reservationJson(elsewhere, "2036-04-01", "2036-04-03", null))
                .andExpect(status().isBadRequest());
    }

    /** The current behaviour behind BIZ-06, so a fix shows up as a change here too. */
    @Test
    void putMovingAcrossPropertiesIsStillOverlapChecked() throws Exception {
        TestOwner o = newOwner();
        String room = roomIds(o.token(), createProperty(o.token(), "Here", 1)).getFirst();
        String elsewhere = roomIds(o.token(), createProperty(o.token(), "There", 1)).getFirst();
        String a = createReservation(o.token(), room, "2036-04-01", "2036-04-03", null);
        createReservation(o.token(), elsewhere, "2036-04-02", "2036-04-05", null);
        putJson("/api/reservations/" + a, o.token(), reservationJson(elsewhere, "2036-04-01", "2036-04-03", null))
                .andExpect(status().isConflict());
        TestOwner b = newOwner();
        putJson("/api/reservations/" + a, o.token(), reservationJson(newRoom(b.token()), "2036-04-01", "2036-04-03", null))
                .andExpect(status().isNotFound());
    }

    @Test
    void copyKeepsGuestStatusNotesAndGuestsButNotAmounts() throws Exception {
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Group", 3));
        String a = createReservation(o.token(), rooms.get(0), "2036-05-10", "2036-05-13", FULL);
        jdbc.update("UPDATE reservation SET price_needs_review = true WHERE id = ?::uuid", a);

        String copies = body(send(post("/api/reservations/" + a + "/copy"), o.token(),
                "{\"unitIds\":[\"" + rooms.get(1) + "\",\"" + rooms.get(2) + "\",\"" + rooms.get(1) + "\"]}") // duplicate ignored
                .andExpect(status().isOk()));
        assertEquals(2, (int) JsonPath.read(copies, "$.length()"));
        for (int i = 0; i < 2; i++) {
            String c = "$[" + i + "].";
            assertEquals(rooms.get(i + 1), JsonPath.read(copies, c + "unitId"));
            assertEquals("2036-05-10", JsonPath.read(copies, c + "checkIn"));
            assertEquals("2036-05-13", JsonPath.read(copies, c + "checkOut"));
            // Owner's rule (2026-11-13): a copy starts as CONFIRMED (it has no amounts, so it cannot be paid yet)
            assertEquals("CONFIRMED", JsonPath.read(copies, c + "status"));
            assertEquals("DIRECT", JsonPath.read(copies, c + "source"));
            assertEquals("Ana Petrova", JsonPath.read(copies, c + "guestName"));
            assertEquals("ana@example.test", JsonPath.read(copies, c + "guestEmail"));
            assertEquals("+389 70 000 000", JsonPath.read(copies, c + "guestPhone"));
            assertEquals(3, (int) JsonPath.read(copies, c + "guestsCount"));
            assertEquals("Late arrival", JsonPath.read(copies, c + "notes"));
            assertNull(JsonPath.read(copies, c + "pricePerGuest"));
            assertNull(JsonPath.read(copies, c + "nightlyRate"));
            assertNull(JsonPath.read(copies, c + "totalAmount"));
            assertEquals(Boolean.FALSE, (Boolean) JsonPath.read(copies, c + "priceNeedsReview"));
        }
        // the copies show up as "missing amount" in the invoices until a price is entered
        String property = JsonPath.read(getJson("/api/units/" + rooms.get(0), o.token()), "$.propertyId");
        String missing = getJson("/api/invoices/properties/" + property + "/missing-amounts", o.token());
        assertEquals(2, (int) JsonPath.read(missing, "$.reservations.totalElements"));
    }

    @Test
    void copyIsAllOrNothingAndLimitedToTheSameProperty() throws Exception {
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Group", 3));
        String elsewhere = newRoom(o.token());
        String a = createReservation(o.token(), rooms.get(0), "2036-06-10", "2036-06-13", null);
        createReservation(o.token(), rooms.get(2), "2036-06-12", "2036-06-14", null);

        send(post("/api/reservations/" + a + "/copy"), o.token(),
                "{\"unitIds\":[\"" + rooms.get(1) + "\",\"" + rooms.get(2) + "\"]}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DATES_TAKEN"));
        assertEquals(0, liveCount(rooms.get(1))); // the free room got nothing either

        send(post("/api/reservations/" + a + "/copy"), o.token(), "{\"unitIds\":[\"" + rooms.get(1) + "\",\"" + elsewhere + "\"]}")
                .andExpect(status().isBadRequest());
        assertEquals(0, liveCount(rooms.get(1)));
        send(post("/api/reservations/" + a + "/copy"), o.token(), "{\"unitIds\":[\"" + rooms.get(0) + "\"]}")
                .andExpect(status().isBadRequest());
        send(post("/api/reservations/" + a + "/copy"), o.token(), "{\"unitIds\":[]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        send(delete("/api/reservations/" + a), o.token(), null);
        send(post("/api/reservations/" + a + "/copy"), o.token(), "{\"unitIds\":[\"" + rooms.get(1) + "\"]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("A cancelled booking can't be copied"));
    }

    @Test
    void cancelledBookingsLeaveTheListInvoicesAndFeedButStayInTheCancelledList() throws Exception {
        TestOwner o = newOwner();
        String property = createProperty(o.token(), "Cancel", 1);
        String room = roomIds(o.token(), property).getFirst();
        String feed = JsonPath.read(getJson("/api/units/" + room, o.token()), "$.token");
        String a = createReservation(o.token(), room, "2036-07-01", "2036-07-04", "\"guestName\":\"Zed Cancel\",\"totalAmount\":300");
        send(delete("/api/reservations/" + a), o.token(), null).andExpect(status().isNoContent());

        assertFalse(getJson("/api/reservations", o.token()).contains(a));
        String inv = getJson("/api/invoices/properties/" + property + "/units", o.token());
        assertEquals(0, (int) JsonPath.read(inv, "$.grandTotal.reservationCount"));
        assertFalse(getJson("/api/invoices/units/" + room + "/reservations", o.token()).contains(a));
        assertFalse(body(mvc.perform(get("/api/ical/" + feed + ".ics"))).contains("Zed Cancel"));
        String cancelled = getJson("/api/reservations/cancelled?name=zed", o.token());
        assertEquals(List.of(a), JsonPath.read(cancelled, "$.items[*].id"));
        // DELETE is idempotent; the nights are free
        send(delete("/api/reservations/" + a), o.token(), null).andExpect(status().isNoContent());
        createReservation(o.token(), room, "2036-07-01", "2036-07-04", null);
    }

    /** Documents current behaviour (BIZ-08): guestsCount is only checked against 1..100, never against the room's capacity. */
    @Test
    void guestsCountIsNotCheckedAgainstRoomCapacity() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token()); // capacity 2
        assertEquals(2, (int) JsonPath.read(getJson("/api/units/" + room, o.token()), "$.capacity"));
        String r = body(send(post("/api/reservations"), o.token(),
                reservationJson(room, "2036-08-01", "2036-08-02", "\"guestsCount\":7")).andExpect(status().isOk()));
        assertEquals(7, (int) JsonPath.read(r, "$.guestsCount"));
        send(post("/api/reservations"), o.token(), reservationJson(room, "2036-08-02", "2036-08-03", "\"guestsCount\":0"))
                .andExpect(status().isBadRequest());
        send(post("/api/reservations"), o.token(), reservationJson(room, "2036-08-02", "2036-08-03", "\"guestsCount\":101"))
                .andExpect(status().isBadRequest());
        // shrinking the room below the booked guests is also allowed
        renameRoom(o.token(), room, "Tiny");
        assertEquals(7, (int) JsonPath.read(getJson("/api/reservations/" + JsonPath.read(r, "$.id"), o.token()), "$.guestsCount"));
    }

    /** Documents current behaviour: PUT is a full replace; leaving out guestsCount resets it to 2, leaving out amounts clears them. */
    @Test
    void putIsAFullReplace() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String a = createReservation(o.token(), room, "2036-09-01", "2036-09-04", FULL);
        String r = body(putJson("/api/reservations/" + a, o.token(), reservationJson(room, "2036-09-01", "2036-09-04", null))
                .andExpect(status().isOk()));
        assertEquals(2, (int) JsonPath.read(r, "$.guestsCount"));
        assertNull(JsonPath.read(r, "$.totalAmount"));
        assertNull(JsonPath.read(r, "$.notes"));
        assertEquals("PAID", JsonPath.read(r, "$.status")); // status is the exception: kept when absent
        assertEquals(null, decAt(r, "$.nightlyRate"));
    }
}
