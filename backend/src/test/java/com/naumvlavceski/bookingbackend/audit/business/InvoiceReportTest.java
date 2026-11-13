package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 3.8: invoice totals against a known data set.
 *
 * <p>Rule proven here: a booking belongs to a period by its CHECK-IN date only (from/to inclusive), and then counts
 * with ALL its nights and its WHOLE amount. There is no splitting of a stay across months or years.
 *
 * <pre>
 * Property "Seaside" (P1)
 *   Room 1: f 2030-12-30..2031-01-02 (3n) PAID      150     crosses the year
 *           a 2031-01-10..2031-01-13 (3n) CONFIRMED 300
 *           b 2031-01-30..2031-02-03 (4n) PAID      400     crosses the month (2 nights Jan, 2 nights Feb)
 *           c 2031-02-10..2031-02-12 (2n) CONFIRMED null    missing amount
 *           d 2031-03-01..2031-03-02 (1n) BLOCK      50     never invoiced
 *           e 2031-03-05..2031-03-07 (2n) CANCELLED  70     never invoiced
 *   Room 2: g 2031-01-15..2031-01-20 (5n) CONFIRMED 500.50
 *           h 2031-02-01..2031-02-02 (1n) CONFIRMED   0     zero is an amount
 *           i 2031-02-20..2031-02-23 (3n) CONFIRMED null    source BOOKING (inserted by SQL), price_needs_review
 * Property "Hills" (P2)
 *   Room 1: j 2031-01-10..2031-01-12 (2n) CONFIRMED 999     must never show up under P1
 * </pre>
 */
class InvoiceReportTest extends BusinessTestBase {

    record Seed(String token, String p1, String p2, String r1, String r2, String r3, String i) {}

    Seed seed() throws Exception {
        TestOwner o = newOwner();
        String t = o.token();
        String p1 = createProperty(t, "Seaside", 2);
        List<String> rooms = roomIds(t, p1);
        String r1 = rooms.get(0), r2 = rooms.get(1);
        String p2 = createProperty(t, "Hills", 1);
        String r3 = roomIds(t, p2).getFirst();
        createReservation(t, r1, "2030-12-30", "2031-01-02", "\"status\":\"PAID\",\"totalAmount\":150,\"guestName\":\"f\"");
        createReservation(t, r1, "2031-01-10", "2031-01-13", "\"totalAmount\":300,\"guestName\":\"a\"");
        createReservation(t, r1, "2031-01-30", "2031-02-03", "\"status\":\"PAID\",\"totalAmount\":400,\"guestName\":\"b\"");
        createReservation(t, r1, "2031-02-10", "2031-02-12", "\"guestName\":\"c\"");
        createReservation(t, r1, "2031-03-01", "2031-03-02", "\"status\":\"BLOCK\",\"totalAmount\":50,\"guestName\":\"d\"");
        String e = createReservation(t, r1, "2031-03-05", "2031-03-07", "\"totalAmount\":70,\"guestName\":\"e\"");
        send(delete("/api/reservations/" + e), t, null).andExpect(status().isNoContent());
        createReservation(t, r2, "2031-01-15", "2031-01-20", "\"totalAmount\":500.50,\"guestName\":\"g\"");
        createReservation(t, r2, "2031-02-01", "2031-02-02", "\"totalAmount\":0,\"guestName\":\"h\"");
        String i = insertRaw(r2, "2031-02-20", "2031-02-23", "CONFIRMED", "BOOKING", "i", null);
        jdbc.update("UPDATE reservation SET price_needs_review = true WHERE id = ?::uuid", i);
        createReservation(t, r3, "2031-01-10", "2031-01-12", "\"totalAmount\":999,\"guestName\":\"j\"");
        return new Seed(t, p1, p2, r1, r2, r3, i);
    }

    private String units(Seed s, String property, String query) throws Exception {
        return getJson("/api/invoices/properties/" + property + "/units" + query, s.token());
    }

    /** grand total: nights, earnings, count, withoutAmount */
    private static void assertGrand(String json, long nights, String earnings, long count, long withoutAmount) {
        assertEquals(nights, ((Number) JsonPath.read(json, "$.grandTotal.totalDays")).longValue(), "nights " + json);
        assertEquals(0, new BigDecimal(earnings).compareTo(decAt(json, "$.grandTotal.earnings")), "earnings " + json);
        assertEquals(count, ((Number) JsonPath.read(json, "$.grandTotal.reservationCount")).longValue(), "count " + json);
        assertEquals(withoutAmount, ((Number) JsonPath.read(json, "$.grandTotal.reservationsWithoutAmount")).longValue(), json);
    }

    private static void assertUnit(String json, int index, long nights, String earnings, long count, long withoutAmount) {
        String u = "$.units[" + index + "].";
        assertEquals(nights, ((Number) JsonPath.read(json, u + "totalDays")).longValue(), "nights " + json);
        assertEquals(0, new BigDecimal(earnings).compareTo(decAt(json, u + "earnings")), "earnings " + json);
        assertEquals(count, ((Number) JsonPath.read(json, u + "reservationCount")).longValue(), "count " + json);
        assertEquals(withoutAmount, ((Number) JsonPath.read(json, u + "reservationsWithoutAmount")).longValue(), json);
    }

    @Test
    void allTimeTotalsPerRoomAndForTheProperty() throws Exception {
        Seed s = seed();
        String all = units(s, s.p1(), "");
        assertEquals(List.of("Room 1", "Room 2"), JsonPath.read(all, "$.units[*].unitName"));
        assertUnit(all, 0, 12, "850.00", 4, 1);   // f a b c
        assertUnit(all, 1, 9, "500.50", 3, 1);    // g h i
        assertGrand(all, 21, "1350.50", 7, 2);
        assertEquals("Seaside", JsonPath.read(all, "$.propertyName"));
        assertEquals(null, (Object) JsonPath.read(all, "$.currency"));

        String hills = units(s, s.p2(), "");
        assertGrand(hills, 2, "999.00", 1, 0);
        String props = getJson("/api/invoices/properties", s.token());
        assertEquals(List.of("Hills", "Seaside"), JsonPath.read(props, "$[*].propertyName"));
        assertEquals(List.of(1, 2), JsonPath.read(props, "$[*].unitCount"));
    }

    @Test
    void periodsFilterOnCheckInOnlyAndCountWholeStays() throws Exception {
        Seed s = seed();
        // January 2031: a, b (all 4 nights and all 400 although 2 nights are in February), g. Not f (checked in 2030).
        String jan = units(s, s.p1(), "?from=2031-01-01&to=2031-01-31");
        assertUnit(jan, 0, 7, "700.00", 2, 0);
        assertUnit(jan, 1, 5, "500.50", 1, 0);
        assertGrand(jan, 12, "1200.50", 3, 0);
        // February 2031: c, h, i. b's two February nights are NOT here.
        String feb = units(s, s.p1(), "?from=2031-02-01&to=2031-02-28");
        assertUnit(feb, 0, 2, "0.00", 1, 1);
        assertUnit(feb, 1, 4, "0.00", 2, 1);
        assertGrand(feb, 6, "0.00", 3, 2);
        // December 2030: all 3 nights of f, including the one in January 2031
        assertGrand(units(s, s.p1(), "?from=2030-12-01&to=2030-12-31"), 3, "150.00", 1, 0);
        // the year 2031 excludes f entirely
        assertGrand(units(s, s.p1(), "?from=2031-01-01&to=2031-12-31"), 18, "1200.50", 6, 2);
        // one day: from = to = check-in day of b
        assertGrand(units(s, s.p1(), "?from=2031-01-30&to=2031-01-30"), 4, "400.00", 1, 0);
        // a day in the middle of b's stay finds nothing
        assertGrand(units(s, s.p1(), "?from=2031-01-31&to=2031-01-31"), 0, "0.00", 0, 0);
        // open ranges
        assertGrand(units(s, s.p1(), "?from=2031-02-01"), 6, "0.00", 3, 2);
        assertGrand(units(s, s.p1(), "?to=2031-01-12"), 6, "450.00", 2, 0);
    }

    @Test
    void emptyAndInvalidRanges() throws Exception {
        Seed s = seed();
        String empty = units(s, s.p1(), "?from=2032-01-01&to=2032-12-31");
        assertEquals(2, (int) JsonPath.read(empty, "$.units.length()")); // rooms still listed, with zeros
        assertUnit(empty, 0, 0, "0.00", 0, 0);
        assertGrand(empty, 0, "0.00", 0, 0);
        send(get("/api/invoices/properties/" + s.p1() + "/units?from=2031-02-01&to=2031-01-01"), s.token(), null)
                .andExpect(status().isBadRequest());
        send(get("/api/invoices/properties/" + s.p1() + "/units?from=2031-13-01"), s.token(), null)
                .andExpect(status().isBadRequest());
        send(get("/api/invoices/units/" + s.r1() + "/reservations?from=2031-02-01&to=2031-01-01"), s.token(), null)
                .andExpect(status().isBadRequest());
    }

    @Test
    void statusAndSourceFilters() throws Exception {
        Seed s = seed();
        String paid = units(s, s.p1(), "?status=PAID");
        assertUnit(paid, 0, 7, "550.00", 2, 0);
        assertUnit(paid, 1, 0, "0.00", 0, 0);
        String confirmed = units(s, s.p1(), "?status=CONFIRMED");
        assertGrand(confirmed, 14, "800.50", 5, 2);
        String booking = units(s, s.p1(), "?source=BOOKING");
        assertGrand(booking, 3, "0.00", 1, 1);
        String direct = units(s, s.p1(), "?source=DIRECT");
        assertGrand(direct, 18, "1350.50", 6, 1);
        assertGrand(units(s, s.p1(), "?source=AIRBNB"), 0, "0.00", 0, 0); // Airbnb leftover: accepted, always empty
        assertGrand(units(s, s.p1(), "?status=PAID&source=BOOKING"), 0, "0.00", 0, 0);
        assertGrand(units(s, s.p1(), "?status=CONFIRMED&from=2031-02-01&to=2031-02-28&source=DIRECT"), 3, "0.00", 2, 1);
        send(get("/api/invoices/properties/" + s.p1() + "/units?source=EXPEDIA"), s.token(), null).andExpect(status().isBadRequest());
    }

    @Test
    void unitReservationListMatchesItsTotalsAndPagesOnlyTheList() throws Exception {
        Seed s = seed();
        String r1 = getJson("/api/invoices/units/" + s.r1() + "/reservations?size=2", s.token());
        assertEquals(12, (int) JsonPath.read(r1, "$.totalDays"));
        assertEquals(0, new BigDecimal("850.00").compareTo(decAt(r1, "$.earnings")));
        assertEquals(4, (int) JsonPath.read(r1, "$.reservationCount"));
        assertEquals(1, (int) JsonPath.read(r1, "$.reservationsWithoutAmount"));
        assertEquals(4, (int) JsonPath.read(r1, "$.reservations.totalElements"));
        assertEquals(2, (int) JsonPath.read(r1, "$.reservations.totalPages"));
        assertEquals(List.of("c", "b"), JsonPath.read(r1, "$.reservations.items[*].guestName")); // latest check-in first
        String page2 = getJson("/api/invoices/units/" + s.r1() + "/reservations?size=2&page=1", s.token());
        assertEquals(List.of("a", "f"), JsonPath.read(page2, "$.reservations.items[*].guestName"));
        assertEquals("[3,3]", JsonPath.read(page2, "$.reservations.items[*].nights").toString());
        assertEquals(12, (int) JsonPath.read(page2, "$.totalDays")); // totals do not depend on the page

        String jan = getJson("/api/invoices/units/" + s.r1() + "/reservations?from=2031-01-01&to=2031-01-31", s.token());
        assertEquals(List.of("b", "a"), JsonPath.read(jan, "$.reservations.items[*].guestName"));
        assertEquals("[4,3]", JsonPath.read(jan, "$.reservations.items[*].nights").toString());
        assertEquals(0, new BigDecimal("400.00").compareTo(decAt(jan, "$.reservations.items[0].totalAmount")));
        // size is clamped to 1..100
        assertEquals(100, (int) JsonPath.read(getJson("/api/invoices/units/" + s.r1() + "/reservations?size=1000", s.token()),
                "$.reservations.size"));
        // the other property's room never mixes in
        String hills = getJson("/api/invoices/units/" + s.r3() + "/reservations", s.token());
        assertEquals(List.of("j"), JsonPath.read(hills, "$.reservations.items[*].guestName"));
    }

    @Test
    void missingAmountsListAndPriceNeedsReview() throws Exception {
        Seed s = seed();
        String all = getJson("/api/invoices/properties/" + s.p1() + "/missing-amounts", s.token());
        assertEquals(List.of("i", "c"), JsonPath.read(all, "$.reservations.items[*].guestName"));
        assertEquals(List.of("BOOKING", "DIRECT"), JsonPath.read(all, "$.reservations.items[*].source"));
        String room2 = getJson("/api/invoices/properties/" + s.p1() + "/missing-amounts?unitId=" + s.r2(), s.token());
        assertEquals(List.of("i"), JsonPath.read(room2, "$.reservations.items[*].guestName"));
        assertEquals("Room 2", JsonPath.read(room2, "$.unitName"));
        assertEquals(0, (int) JsonPath.read(getJson("/api/invoices/properties/" + s.p1() + "/missing-amounts?status=PAID",
                s.token()), "$.reservations.totalElements"));
        assertEquals(1, (int) JsonPath.read(getJson("/api/invoices/properties/" + s.p1()
                + "/missing-amounts?from=2031-02-15", s.token()), "$.reservations.totalElements"));
        // a room of another property is refused
        send(get("/api/invoices/properties/" + s.p1() + "/missing-amounts?unitId=" + s.r3()), s.token(), null)
                .andExpect(status().isNotFound());

        // priceNeedsReview: shown on the booking, does not change the invoice figures, cleared by saving it
        String i = getJson("/api/reservations/" + s.i(), s.token());
        assertEquals(Boolean.TRUE, (Boolean) JsonPath.read(i, "$.priceNeedsReview"));
        assertEquals("BOOKING", JsonPath.read(i, "$.source"));
        putJson("/api/reservations/" + s.i(), s.token(), reservationJson(s.r2(), "2031-02-20", "2031-02-23",
                "\"guestName\":\"i\",\"totalAmount\":330")).andExpect(status().isOk());
        String after = getJson("/api/reservations/" + s.i(), s.token());
        assertEquals(Boolean.FALSE, (Boolean) JsonPath.read(after, "$.priceNeedsReview"));
        assertEquals("BOOKING", JsonPath.read(after, "$.source")); // editing an import keeps its source
        assertGrand(units(s, s.p1(), ""), 21, "1680.50", 7, 1);
    }

    @Test
    void anotherOwnerSeesNoneOfIt() throws Exception {
        Seed s = seed();
        TestOwner b = newOwner();
        send(get("/api/invoices/properties/" + s.p1() + "/units"), b.token(), null).andExpect(status().isNotFound());
        send(get("/api/invoices/units/" + s.r1() + "/reservations"), b.token(), null).andExpect(status().isNotFound());
        send(get("/api/invoices/properties/" + s.p1() + "/export"), b.token(), null).andExpect(status().isNotFound());
        assertEquals("[]", getJson("/api/invoices/properties", b.token()));
    }
}
