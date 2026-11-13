package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 3.1: the overlap rule through the API. A stay is the half-open range [checkIn, checkOut): the check-out day
 * is free again, so back-to-back stays are allowed and any shared night is refused with 409 DATES_TAKEN.
 */
class OverlapRulesTest extends BusinessTestBase {

    private int create(String token, String unit, String in, String out, String extra) throws Exception {
        return send(post("/api/reservations"), token, reservationJson(unit, in, out, extra)).andReturn().getResponse().getStatus();
    }

    @Test
    void everyKindOfSharedNightIsRefusedWithDatesTaken() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        createReservation(o.token(), room, "2030-07-10", "2030-07-14", null);

        // identical, starts inside, ends inside, surrounds, inside, same start, same end
        String[][] clashes = {{"2030-07-10", "2030-07-14"}, {"2030-07-12", "2030-07-16"}, {"2030-07-08", "2030-07-11"},
                {"2030-07-01", "2030-07-31"}, {"2030-07-11", "2030-07-12"}, {"2030-07-10", "2030-07-11"},
                {"2030-07-13", "2030-07-14"}};
        for (String[] c : clashes) {
            send(post("/api/reservations"), o.token(), reservationJson(room, c[0], c[1], null))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DATES_TAKEN"))
                    .andExpect(jsonPath("$.room").value("Room 1"))
                    .andExpect(jsonPath("$.takenFrom").value("2030-07-10"))
                    .andExpect(jsonPath("$.takenTo").value("2030-07-14"));
        }
        assertEquals(1, liveCount(room));
    }

    @Test
    void backToBackStaysOnBothSidesAreAllowed() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        createReservation(o.token(), room, "2030-07-10", "2030-07-14", null);
        assertEquals(200, create(o.token(), room, "2030-07-14", "2030-07-16", null)); // arrives the day the first leaves
        assertEquals(200, create(o.token(), room, "2030-07-08", "2030-07-10", null)); // leaves the day the first arrives
        assertEquals(3, liveCount(room));
    }

    @Test
    void checkOutMustBeAfterCheckIn() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        send(post("/api/reservations"), o.token(), reservationJson(room, "2030-07-10", "2030-07-10", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Check-out must be after check-in"));
        send(post("/api/reservations"), o.token(), reservationJson(room, "2030-07-10", "2030-07-09", null))
                .andExpect(status().isBadRequest());
        send(post("/api/reservations"), o.token(), "{\"unitId\":\"" + room + "\",\"checkIn\":\"2030-07-10\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        // the same rule on update
        String id = createReservation(o.token(), room, "2030-08-01", "2030-08-03", null);
        putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2030-08-03", "2030-08-01", null))
                .andExpect(status().isBadRequest());
        assertEquals(1, liveCount(room));
    }

    @Test
    void oneNightStaysChainDayAfterDay() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        for (int d = 1; d <= 7; d++) {
            assertEquals(200, create(o.token(), room, String.format("2030-09-%02d", d), String.format("2030-09-%02d", d + 1), null));
        }
        assertEquals(409, create(o.token(), room, "2030-09-04", "2030-09-05", null));
        assertEquals(7, liveCount(room));
    }

    /** Documents current behaviour (BIZ-07): no maximum stay length for direct bookings; 10-year stays are accepted. */
    @Test
    void veryLongStaysAreAcceptedAndBlockTheRoomForTheirWholeLength() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        assertEquals(200, create(o.token(), room, "2040-01-01", "2041-01-01", null));           // 366 nights (leap year)
        assertEquals(200, create(o.token(), room, "2041-01-01", "2042-01-01", null));           // 365 nights, back to back
        String other = newRoom(o.token());
        assertEquals(200, create(o.token(), other, "2040-01-01", "2049-12-29", null));          // 3650 nights
        assertEquals(409, create(o.token(), other, "2047-06-01", "2047-06-02", null));          // years later: still taken
        // The public feed exports the whole 10-year block as one event
        String feedToken = JsonPath.read(getJson("/api/units/" + other, o.token()), "$.token");
        String ics = body(mvc.perform(get("/api/ical/" + feedToken + ".ics")).andExpect(status().isOk()));
        assertTrue(ics.contains("DTSTART;VALUE=DATE:20400101") && ics.contains("DTEND;VALUE=DATE:20491229"), ics);
    }

    /** Documents current behaviour: past stays are allowed (owners enter history); year 1900 too. */
    @Test
    void pastDatesAreAccepted() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        assertEquals(200, create(o.token(), room, "2020-03-01", "2020-03-05", null));
        assertEquals(200, create(o.token(), room, "1900-01-01", "1900-01-02", null));
        assertEquals(409, create(o.token(), room, "2020-03-04", "2020-03-06", null));
    }

    @Test
    void farFutureDatesUpToYear9999WorkAndYear10000IsRefusedCleanly() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        assertEquals(200, create(o.token(), room, "2100-12-30", "2101-01-02", null));
        assertEquals(200, create(o.token(), room, "9999-12-30", "9999-12-31", null));
        assertEquals(409, create(o.token(), room, "9999-12-30", "9999-12-31", null));
        // Five-digit years are not valid ISO-8601 without a sign: a clean 400, not a 500
        assertEquals(400, create(o.token(), room, "9999-12-31", "10000-01-01", null));
        String list = getJson("/api/reservations?unitId=" + room, o.token());
        assertEquals(List.of("2100-12-30", "9999-12-30"), JsonPath.read(list, "$[*].checkIn"));
    }

    @Test
    void leapDayIsANormalNight() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        assertEquals(200, create(o.token(), room, "2028-02-28", "2028-03-01", null)); // 28 + 29 Feb = 2 nights
        assertEquals(409, create(o.token(), room, "2028-02-29", "2028-03-01", null));
        assertEquals(200, create(o.token(), room, "2028-03-01", "2028-03-02", null));
        assertEquals(400, create(o.token(), room, "2027-02-29", "2027-03-01", null)); // no 29 Feb in 2027
        String nights = getJson("/api/invoices/units/" + room + "/reservations?from=2028-02-28&to=2028-02-28", o.token());
        assertEquals(2, (int) JsonPath.read(nights, "$.totalDays"));
    }

    @Test
    void monthAndYearBoundariesFollowTheSameRule() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        assertEquals(200, create(o.token(), room, "2030-12-30", "2031-01-02", null));
        assertEquals(409, create(o.token(), room, "2030-12-31", "2031-01-01", null)); // New Year's Eve night
        assertEquals(409, create(o.token(), room, "2031-01-01", "2031-01-03", null));
        assertEquals(200, create(o.token(), room, "2031-01-02", "2031-01-03", null));
        assertEquals(200, create(o.token(), room, "2031-01-31", "2031-02-01", null));
        assertEquals(200, create(o.token(), room, "2031-02-01", "2031-02-02", null));
    }

    /** Dates are calendar dates (PostgreSQL date / LocalDate), no times: DST switch days have nothing to shift. */
    @Test
    void europeanDstChangeDaysCountAsOrdinaryNights() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        assertEquals(200, create(o.token(), room, "2026-03-28", "2026-03-30", null)); // clocks forward 29 Mar 2026
        assertEquals(200, create(o.token(), room, "2026-03-30", "2026-03-31", null));
        assertEquals(409, create(o.token(), room, "2026-03-29", "2026-03-30", null));
        assertEquals(200, create(o.token(), room, "2026-10-24", "2026-10-26", null)); // clocks back 25 Oct 2026
        assertEquals(409, create(o.token(), room, "2026-10-25", "2026-10-26", null));
        String inv = getJson("/api/invoices/units/" + room + "/reservations?from=2026-03-01&to=2026-10-31", o.token());
        assertEquals(5, (int) JsonPath.read(inv, "$.totalDays")); // 2 + 1 + 2, no 23/25-hour drift
        // newest check-in first: 24 Oct (2), 30 Mar (1), 28 Mar (2)
        assertEquals("[2,1,2]", JsonPath.read(inv, "$.reservations.items[*].nights").toString());
    }

    @Test
    void blockedDatesAndPaidStaysOccupyTheRoom() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        createReservation(o.token(), room, "2030-08-01", "2030-08-05", "\"status\":\"BLOCK\"");
        createReservation(o.token(), room, "2030-08-10", "2030-08-12", "\"status\":\"PAID\"");
        assertEquals(409, create(o.token(), room, "2030-08-03", "2030-08-04", null));
        assertEquals(409, create(o.token(), room, "2030-08-11", "2030-08-12", "\"status\":\"BLOCK\""));
        assertEquals(200, create(o.token(), room, "2030-08-05", "2030-08-10", null));
    }

    @Test
    void cancellingFreesTheNights() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2030-10-01", "2030-10-05", null);
        send(delete("/api/reservations/" + id), o.token(), null).andExpect(status().isNoContent());
        assertEquals(200, create(o.token(), room, "2030-10-01", "2030-10-05", null));
        // a BLOCK also frees its nights when cancelled through PUT
        String block = createReservation(o.token(), room, "2030-11-01", "2030-11-03", "\"status\":\"BLOCK\"");
        putJson("/api/reservations/" + block, o.token(), reservationJson(room, "2030-11-01", "2030-11-03", "\"status\":\"CANCELLED\""))
                .andExpect(status().isNoContent());
        assertEquals(200, create(o.token(), room, "2030-11-01", "2030-11-03", null));
    }

    @Test
    void restoringACancelledBookingIntoTakenDatesIsRefusedAndItStaysCancelled() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String a = createReservation(o.token(), room, "2030-12-01", "2030-12-04", null);
        send(delete("/api/reservations/" + a), o.token(), null).andExpect(status().isNoContent());
        createReservation(o.token(), room, "2030-12-03", "2030-12-06", null);

        putJson("/api/reservations/" + a, o.token(), reservationJson(room, "2030-12-01", "2030-12-04", "\"status\":\"CONFIRMED\""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DATES_TAKEN"))
                .andExpect(jsonPath("$.takenFrom").value("2030-12-03"));
        assertEquals("CANCELLED", JsonPath.read(getJson("/api/reservations/" + a, o.token()), "$.status"));
        // restore into free dates works and clears cancelledAt
        String restored = body(putJson("/api/reservations/" + a, o.token(),
                reservationJson(room, "2030-12-01", "2030-12-03", "\"status\":\"PAID\"")).andExpect(status().isOk()));
        assertEquals("PAID", JsonPath.read(restored, "$.status"));
        assertEquals(null, (Object) JsonPath.read(restored, "$.cancelledAt"));
    }

    @Test
    void updateIsCheckedAgainstOthersButNotAgainstItself() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String a = createReservation(o.token(), room, "2031-05-01", "2031-05-05", null);
        createReservation(o.token(), room, "2031-05-10", "2031-05-12", null);
        putJson("/api/reservations/" + a, o.token(), reservationJson(room, "2031-05-02", "2031-05-07", null))
                .andExpect(status().isOk()); // overlaps its own old dates only
        putJson("/api/reservations/" + a, o.token(), reservationJson(room, "2031-05-02", "2031-05-11", null))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DATES_TAKEN"));
        String now = getJson("/api/reservations/" + a, o.token());
        assertEquals("2031-05-02", JsonPath.read(now, "$.checkIn"));
        assertEquals("2031-05-07", JsonPath.read(now, "$.checkOut"));
    }

    @Test
    void otherRoomsAreIndependent() throws Exception {
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Twin", 2));
        createReservation(o.token(), rooms.get(0), "2031-06-01", "2031-06-05", null);
        assertEquals(200, create(o.token(), rooms.get(1), "2031-06-01", "2031-06-05", null));
        // another owner's identical dates never interact
        TestOwner b = newOwner();
        assertEquals(200, create(b.token(), newRoom(b.token()), "2031-06-01", "2031-06-05", null));
    }
}
