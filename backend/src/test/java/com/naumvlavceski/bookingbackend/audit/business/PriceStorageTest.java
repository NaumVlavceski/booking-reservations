package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 3.7: what the backend does with pricePerGuest / nightlyRate / totalAmount. It stores what it is sent, in
 * numeric(10,2) columns, and never recalculates or cross-checks them; the frontend (pricing.ts) owns the price rules.
 * The frontend's side of the same cases is in Docs/testing/fixtures/price-cases.json.
 */
class PriceStorageTest extends BusinessTestBase {

    private Map<String, Object> stored(String id) {
        return jdbc.queryForMap("SELECT price_per_guest, nightly_rate, total_amount FROM reservation WHERE id = ?::uuid", id);
    }

    private static void assertMoney(String expected, Object actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(new BigDecimal(String.valueOf(actual))), expected + " vs " + actual);
    }

    @Test
    void amountsAreStoredAsSentAndNeverRecalculated() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        // 4 nights, 2 guests: 60/night would be 240 total and 30 per guest; send something inconsistent on purpose
        String r = body(send(post("/api/reservations"), o.token(), reservationJson(room, "2037-01-01", "2037-01-05",
                "\"guestsCount\":2,\"pricePerGuest\":1,\"nightlyRate\":60,\"totalAmount\":999")).andExpect(status().isOk()));
        String id = JsonPath.read(r, "$.id");
        String back = getJson("/api/reservations/" + id, o.token());
        assertMoney("1", JsonPath.read(back, "$.pricePerGuest"));
        assertMoney("60", JsonPath.read(back, "$.nightlyRate"));
        assertMoney("999", JsonPath.read(back, "$.totalAmount"));
        Map<String, Object> db = stored(id);
        assertEquals(new BigDecimal("1.00"), db.get("price_per_guest"));
        assertEquals(new BigDecimal("60.00"), db.get("nightly_rate"));
        assertEquals(new BigDecimal("999.00"), db.get("total_amount"));
        // changing the dates through the API does not touch the amounts either
        putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2037-01-01", "2037-01-10",
                "\"guestsCount\":2,\"pricePerGuest\":1,\"nightlyRate\":60,\"totalAmount\":999")).andExpect(status().isOk());
        assertEquals(new BigDecimal("999.00"), stored(id).get("total_amount"));
        // only totalAmount reaches the invoices
        String property = JsonPath.read(getJson("/api/units/" + room, o.token()), "$.propertyId");
        assertMoney("999.00", JsonPath.read(getJson("/api/invoices/properties/" + property + "/units", o.token()), "$.grandTotal.earnings"));
    }

    /** Documents current behaviour behind BIZ-02: the create response echoes 3 decimals, the database keeps 2 (rounded). */
    @Test
    void threeDecimalsAreRoundedHalfUpInTheDatabase() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String r = body(send(post("/api/reservations"), o.token(), reservationJson(room, "2037-02-01", "2037-02-02",
                "\"pricePerGuest\":0.125,\"nightlyRate\":10.004,\"totalAmount\":10.005")).andExpect(status().isOk()));
        String id = JsonPath.read(r, "$.id");
        assertMoney("10.005", JsonPath.read(r, "$.totalAmount"));       // what the response says
        Map<String, Object> db = stored(id);
        assertEquals(new BigDecimal("10.01"), db.get("total_amount"));  // what is stored
        assertEquals(new BigDecimal("10.00"), db.get("nightly_rate"));
        assertEquals(new BigDecimal("0.13"), db.get("price_per_guest"));
        assertMoney("10.01", JsonPath.read(getJson("/api/reservations/" + id, o.token()), "$.totalAmount"));
    }

    // Finding BIZ-02: the create/update response must show the amount that was actually stored (2 decimals).
    @Tag("open-finding")
    @Test
    void responseShowsTheStoredAmount() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String r = body(send(post("/api/reservations"), o.token(),
                reservationJson(room, "2037-02-01", "2037-02-02", "\"totalAmount\":10.005")).andExpect(status().isOk()));
        String id = JsonPath.read(r, "$.id");
        assertEquals(String.valueOf((Object) JsonPath.read(getJson("/api/reservations/" + id, o.token()), "$.totalAmount")),
                String.valueOf((Object) JsonPath.read(r, "$.totalAmount")));
    }

    /** Documents current behaviour behind BIZ-01: 99,999,999.99 fits; 100,000,000 overflows numeric(10,2) and answers 409 CONFLICT. */
    @Test
    void amountsAtAndAboveTheColumnLimit() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String ok = createReservation(o.token(), room, "2037-03-01", "2037-03-02", "\"totalAmount\":99999999.99");
        assertEquals(new BigDecimal("99999999.99"), stored(ok).get("total_amount"));
        for (String field : new String[]{"totalAmount", "nightlyRate", "pricePerGuest"}) {
            send(post("/api/reservations"), o.token(), reservationJson(room, "2037-03-02", "2037-03-03", "\"" + field + "\":100000000"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("CONFLICT"))
                    .andExpect(jsonPath("$.message").value("This request conflicts with existing data."));
        }
        send(post("/api/reservations"), o.token(), reservationJson(room, "2037-03-02", "2037-03-03", "\"totalAmount\":1e20"))
                .andExpect(status().isConflict());
        putJson("/api/reservations/" + ok, o.token(), reservationJson(room, "2037-03-01", "2037-03-02", "\"totalAmount\":123456789"))
                .andExpect(status().isConflict());
        assertEquals(1, liveCount(room));
        assertEquals(new BigDecimal("99999999.99"), stored(ok).get("total_amount")); // the failed PUT changed nothing
    }

    // Finding BIZ-01: an amount too large for the column is a validation error (400 with the field), not a 409 "conflict".
    @Tag("open-finding")
    @Test
    void tooLargeAnAmountIsAValidationError() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        send(post("/api/reservations"), o.token(), reservationJson(room, "2037-03-02", "2037-03-03", "\"totalAmount\":100000000"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.totalAmount").exists());
    }

    @Test
    void negativeAmountsAreRefusedPerField() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        for (String field : new String[]{"totalAmount", "nightlyRate", "pricePerGuest"}) {
            send(post("/api/reservations"), o.token(), reservationJson(room, "2037-04-01", "2037-04-02", "\"" + field + "\":-0.01"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors." + field).exists());
        }
        assertEquals(0, liveCount(room));
    }

    @Test
    void zeroIsAnAmountAndNullIsAMissingAmount() throws Exception {
        TestOwner o = newOwner();
        String property = createProperty(o.token(), "Zero", 1);
        String room = roomIds(o.token(), property).getFirst();
        String zero = createReservation(o.token(), room, "2037-05-01", "2037-05-02", "\"totalAmount\":0,\"nightlyRate\":0,\"pricePerGuest\":0");
        String none = createReservation(o.token(), room, "2037-05-02", "2037-05-03",
                "\"totalAmount\":null,\"nightlyRate\":null,\"pricePerGuest\":null");
        assertEquals(new BigDecimal("0.00"), stored(zero).get("total_amount"));
        assertNull(stored(none).get("total_amount"));
        String missing = getJson("/api/invoices/properties/" + property + "/missing-amounts", o.token());
        assertEquals(java.util.List.of(none), JsonPath.read(missing, "$.reservations.items[*].reservationId"));
        String totals = getJson("/api/invoices/properties/" + property + "/units", o.token());
        assertEquals(1, (int) JsonPath.read(totals, "$.grandTotal.reservationsWithoutAmount"));
        assertEquals(2, (int) JsonPath.read(totals, "$.grandTotal.reservationCount"));
    }

    @Test
    void numbersSentAsStringsAreAcceptedButCommaDecimalsAreNot() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        // the frontend sends typed values as strings ("45.5") and derived ones as numbers
        String s = createReservation(o.token(), room, "2037-06-01", "2037-06-02", "\"totalAmount\":\"45.5\",\"nightlyRate\":\"1e2\"");
        assertEquals(new BigDecimal("45.50"), stored(s).get("total_amount"));
        assertEquals(new BigDecimal("100.00"), stored(s).get("nightly_rate"));
        // a comma decimal (Macedonian / German keyboards) is a clean 400, never stored as something else
        send(post("/api/reservations"), o.token(), reservationJson(room, "2037-06-02", "2037-06-03", "\"totalAmount\":\"12,50\""))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        send(post("/api/reservations"), o.token(), reservationJson(room, "2037-06-02", "2037-06-03", "\"totalAmount\":\"abc\""))
                .andExpect(status().isBadRequest());
        send(post("/api/reservations"), o.token(), reservationJson(room, "2037-06-02", "2037-06-03", "\"totalAmount\":NaN"))
                .andExpect(status().isBadRequest());
        assertEquals(1, liveCount(room));
    }

    /** The frontend sends "" for a cleared price field: the backend stores it as no amount (null). */
    @Test
    void anEmptyStringClearsTheAmount() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String id = createReservation(o.token(), room, "2037-07-01", "2037-07-03", "\"totalAmount\":120,\"nightlyRate\":60");
        String r = body(putJson("/api/reservations/" + id, o.token(), reservationJson(room, "2037-07-01", "2037-07-03",
                "\"totalAmount\":\"\",\"nightlyRate\":60,\"pricePerGuest\":\"\"")).andExpect(status().isOk()));
        assertNull(JsonPath.read(r, "$.totalAmount"));
        assertNull(stored(id).get("total_amount"));
        assertEquals(new BigDecimal("60.00"), stored(id).get("nightly_rate"));
        String created = createReservation(o.token(), room, "2037-07-03", "2037-07-04", "\"totalAmount\":\"\"");
        assertNull(stored(created).get("total_amount"));
    }
}
