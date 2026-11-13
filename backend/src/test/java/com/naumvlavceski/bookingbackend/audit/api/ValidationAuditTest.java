package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 2 "Validation" and "Malformed" columns: missing, empty, too long, wrong type, absurd numbers, unknown enum
 * values, extra fields (mass assignment), wrong content type, malformed, deeply nested and huge bodies. Every refusal
 * is a 4xx in the standard error shape; nothing is a 5xx.
 */
class ValidationAuditTest extends ApiAuditBase {

    private MockHttpServletResponse call(MockHttpServletRequestBuilder req, String token, String json) throws Exception {
        return send(req, token, json).andReturn().getResponse();
    }

    private void expect400(MockHttpServletRequestBuilder req, String token, String json, String code) throws Exception {
        MockHttpServletResponse r = call(req, token, json);
        assertEquals(400, r.getStatus(), "expected 400 for " + json + " but got " + r.getStatus() + " " + r.getContentAsString());
        assertErrorShape(r.getContentAsString(), 400);
        if (code != null) assertEquals(code, JsonPath.read(r.getContentAsString(), "$.code"), r.getContentAsString());
    }

    @Test
    void missingNullEmptyAndTooLongFieldsAre400WithTheField() throws Exception {
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        String pid = createProperty(o.token(), "P", 0);
        String long256 = "x".repeat(256);
        // properties and units
        for (String b : List.of("{}", "{\"name\":null}", "{\"name\":\"\"}", "{\"name\":\"   \"}", "{\"name\":\"" + long256 + "\"}",
                "{\"name\":\"ok\",\"address\":\"" + long256 + "\"}", "{\"name\":\"ok\",\"unitCount\":-1}", "{\"name\":\"ok\",\"unitCount\":201}")) {
            expect400(post("/api/properties"), o.token(), b, "VALIDATION_FAILED");
        }
        expect400(put("/api/properties/" + pid), o.token(), "{\"name\":\"\"}", "VALIDATION_FAILED");
        for (String b : List.of("{\"name\":\"R\"}", "{\"name\":\"R\",\"capacity\":0}", "{\"name\":\"R\",\"capacity\":101}",
                "{\"name\":\"R\",\"capacity\":-5}", "{\"name\":\"" + long256 + "\",\"capacity\":1}", "{\"capacity\":1}")) {
            expect400(post("/api/properties/" + pid + "/units"), o.token(), b, "VALIDATION_FAILED");
            expect400(put("/api/units/" + unit), o.token(), b, "VALIDATION_FAILED");
        }
        // reservations
        for (String extra : List.of("\"guestName\":\"" + long256 + "\"", "\"guestEmail\":\"not-an-email\"", "\"guestPhone\":\"" + long256 + "\"",
                "\"notes\":\"" + long256 + "\"", "\"guestsCount\":0", "\"guestsCount\":101", "\"totalAmount\":-0.01",
                "\"nightlyRate\":-1", "\"pricePerGuest\":-1")) {
            String json = reservationJson(unit, "2043-01-01", "2043-01-02", null).replace("\"guestName\":\"Guest\"", extra);
            expect400(post("/api/reservations"), o.token(), json, "VALIDATION_FAILED");
        }
        expect400(post("/api/reservations"), o.token(), "{\"checkIn\":\"2043-01-01\",\"checkOut\":\"2043-01-02\"}", "VALIDATION_FAILED");
        expect400(post("/api/reservations"), o.token(), "{\"unitId\":\"" + unit + "\",\"checkIn\":null,\"checkOut\":\"2043-01-02\"}", "VALIDATION_FAILED");
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043-01-02", "2043-01-02", null), "BAD_REQUEST");
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043-01-03", "2043-01-02", null), "BAD_REQUEST");
        String res = createReservation(o.token(), unit, "2043-02-01", "2043-02-03", null);
        expect400(post("/api/reservations/" + res + "/move"), o.token(), "{}", "VALIDATION_FAILED");
        expect400(post("/api/reservations/" + res + "/copy"), o.token(), "{\"unitIds\":[]}", "VALIDATION_FAILED");
        expect400(post("/api/reservations/" + res + "/copy"), o.token(), "{\"unitIds\":[null]}", "VALIDATION_FAILED");
        expect400(post("/api/reservations/" + res + "/copy"), o.token(), "{}", "VALIDATION_FAILED");
        // calendars, account, notifications, contact, auth
        expect400(post("/api/units/" + unit + "/calendars"), o.token(), "{\"icsUrl\":\"\"}", "VALIDATION_FAILED");
        expect400(post("/api/units/" + unit + "/calendars"), o.token(), "{\"icsUrl\":\"https://ical.booking.com/" + "a".repeat(1000) + "\"}", "VALIDATION_FAILED");
        expect400(put("/api/notifications/settings"), o.token(), "{}", "VALIDATION_FAILED");
        expect400(put("/api/notifications/settings"), o.token(), "{\"enabled\":null}", "VALIDATION_FAILED");
        expect400(post("/api/me/support"), o.token(), "{\"message\":\"\"}", "VALIDATION_FAILED");
        expect400(post("/api/me/support"), o.token(), "{\"message\":\"" + "m".repeat(5001) + "\"}", "VALIDATION_FAILED");
        expect400(post("/api/me/password"), o.token(), "{\"currentPassword\":\"" + "p".repeat(73) + "\",\"newPassword\":\"Valid-pass-1\"}", "VALIDATION_FAILED");
        expect400(post("/api/me/delete"), o.token(), "{\"password\":\"\",\"confirmation\":\"DELETE\"}", "VALIDATION_FAILED");
        expect400(post("/api/me/delete"), o.token(), "{\"password\":\"x\",\"confirmation\":\"" + "D".repeat(21) + "\"}", "VALIDATION_FAILED");
        for (String b : List.of("{\"email\":\"a@b.test\",\"subject\":\"" + "s".repeat(151) + "\",\"message\":\"m\"}",
                "{\"email\":\"a@b.test\",\"subject\":\"s\",\"message\":\"" + "m".repeat(5001) + "\"}",
                "{\"email\":\"a@b.test, c@d.test\",\"subject\":\"s\",\"message\":\"m\"}",
                "{\"email\":\"\",\"subject\":\"s\",\"message\":\"m\"}")) {
            MockHttpServletResponse r = sendFrom(randomIp(), post("/api/contact"), null, b).andReturn().getResponse();
            assertEquals(400, r.getStatus(), b);
            assertErrorShape(r.getContentAsString(), 400);
        }
        for (String b : List.of("{}", "{\"email\":\"x\",\"password\":\"Valid-pass-1\",\"fullName\":\"N\"," + ACCEPT_TERMS + "}",
                "{\"email\":\"" + "e".repeat(250) + "@x.test\",\"password\":\"Valid-pass-1\",\"fullName\":\"N\"," + ACCEPT_TERMS + "}",
                "{\"email\":\"a@b.test\",\"password\":\"Valid-pass-1\",\"fullName\":\"" + long256 + "\"," + ACCEPT_TERMS + "}",
                "{\"email\":\"a@b.test\",\"password\":\"Valid-pass-1\",\"fullName\":\"N\",\"acceptedTerms\":false,\"termsVersion\":\"2026-10-30\",\"privacyVersion\":\"2026-10-30\"}",
                "{\"email\":\"a@b.test\",\"password\":\"Valid-pass-1\",\"fullName\":\"N\",\"acceptedTerms\":true,\"termsVersion\":\"latest\",\"privacyVersion\":\"2026-10-30\"}")) {
            expect400(post("/api/auth/register"), null, b, "VALIDATION_FAILED");
        }
        expect400(post("/api/auth/login"), null, "{\"email\":\"\",\"password\":\"\"}", "VALIDATION_FAILED");
        expect400(post("/api/auth/verify-email"), null, "{\"email\":\"a@b.test\",\"code\":\"1234567890123\"}", "VALIDATION_FAILED");
        expect400(post("/api/auth/verify-reset-code"), null, "{\"email\":\"a@b.test\",\"code\":\"\"}", "VALIDATION_FAILED");
        expect400(post("/api/auth/reset-password"), null, "{\"resetToken\":\"" + "t".repeat(129) + "\",\"newPassword\":\"Valid-pass-1\"}", "VALIDATION_FAILED");
        expect400(sendFromBuilder(post("/api/auth/forgot-password")), null, "{\"email\":\"nope\"}", "VALIDATION_FAILED");
        expect400(sendFromBuilder(post("/api/auth/resend-code")), null, "{\"email\":\"\"}", "VALIDATION_FAILED");
    }

    private MockHttpServletRequestBuilder sendFromBuilder(MockHttpServletRequestBuilder b) {
        String ip = randomIp();
        return b.with(r -> { r.setRemoteAddr(ip); return r; });
    }

    @Test
    void everyEndpointRefusesABadIdAndABrokenBodyWith400() throws Exception {
        TestOwner o = newOwner();
        int badIds = 0, brokenBodies = 0;
        for (Object[] ep : EndpointMatrixAuditTest.protectedEndpoints()) {
            var method = (org.springframework.http.HttpMethod) ep[0];
            String path = (String) ep[1];
            if (path.matches(".*[0-9a-f]{8}-[0-9a-f]{4}-.*")) {
                String bad = path.replaceAll("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "not-a-uuid");
                MockHttpServletResponse r = send(request(method, bad), o.token(), (String) ep[2]).andReturn().getResponse();
                assertEquals(400, r.getStatus(), method + " " + bad);
                assertErrorShape(r.getContentAsString(), 400);
                badIds++;
            }
            if (ep[2] != null) {
                MockHttpServletResponse r = send(request(method, path), o.token(), "{\"broken\":").andReturn().getResponse();
                assertEquals(400, r.getStatus(), method + " " + path + " with a broken body");
                assertErrorShape(r.getContentAsString(), 400);
                brokenBodies++;
            }
        }
        for (String p : List.of("/api/auth/register", "/api/auth/login", "/api/auth/verify-email", "/api/auth/resend-code",
                "/api/auth/forgot-password", "/api/auth/verify-reset-code", "/api/auth/reset-password", "/api/contact")) {
            MockHttpServletResponse r = sendFrom(randomIp(), post(p), null, "{\"broken\":").andReturn().getResponse();
            assertEquals(400, r.getStatus(), p);
            assertErrorShape(r.getContentAsString(), 400);
            brokenBodies++;
        }
        // the demo takes no body: one is ignored
        sendFrom(randomIp(), post("/api/auth/demo"), null, "{\"broken\":").andExpect(status().isOk());
        System.out.println("AUDIT-OBS bad-id endpoints: " + badIds + ", broken-body endpoints: " + brokenBodies);
        assertEquals(24, badIds);
        assertEquals(21, brokenBodies);
    }

    @Test
    void wrongTypesUnknownEnumsAndBadPathOrQueryValuesAre400() throws Exception {
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        String pid = createProperty(o.token(), "P", 1);
        expect400(post("/api/properties/" + pid + "/units"), o.token(), "{\"name\":\"R\",\"capacity\":\"abc\"}", "BAD_REQUEST");
        expect400(post("/api/properties"), o.token(), "{\"name\":\"P\",\"unitCount\":2147483648}", "BAD_REQUEST");
        expect400(post("/api/properties"), o.token(), "{\"name\":[\"P\"]}", "BAD_REQUEST");
        expect400(post("/api/properties"), o.token(), "{\"name\":{\"x\":1}}", "BAD_REQUEST");
        expect400(post("/api/reservations"), o.token(), reservationJson("not-a-uuid", "2043-01-01", "2043-01-02", null), "BAD_REQUEST");
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043/01/01", "2043-01-02", null), "BAD_REQUEST");
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043-02-30", "2043-03-02", null), "BAD_REQUEST");
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043-01-01", "2043-01-02", "\"status\":\"PENDING\""), "BAD_REQUEST");
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043-01-01", "2043-01-02", "\"status\":\"confirmed\""), "BAD_REQUEST");
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043-01-01", "2043-01-02", "\"guestsCount\":1e10"), "BAD_REQUEST");
        expect400(put("/api/notifications/settings"), o.token(), "{\"enabled\":\"maybe\"}", "BAD_REQUEST");
        for (String path : List.of("/api/properties/1", "/api/properties/' OR '1'='1", "/api/units/abc", "/api/reservations/123/move",
                "/api/calendars/x/sync", "/api/conflicts/../dismiss", "/api/invoices/units/zzz/reservations")) {
            MockHttpServletResponse r = mvc.perform(path.endsWith("move") || path.endsWith("sync")
                    ? post(path.replace(" ", "%20").replace("'", "%27")).header("Authorization", "Bearer " + o.token())
                    : get(path.replace(" ", "%20").replace("'", "%27")).header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
            assertTrue(r.getStatus() == 400 || r.getStatus() == 404 || r.getStatus() == 405, path + " -> " + r.getStatus());
            if (!r.getContentAsString().isEmpty()) assertNoLeak(r.getContentAsString());
        }
        for (String q : List.of("/api/reservations?status=FOO", "/api/reservations?unitId=nope", "/api/reservations/cancelled?checkInFrom=yesterday",
                "/api/reservations/cancelled?page=abc", "/api/invoices/properties/" + pid + "/units?status=BLOCK",
                "/api/invoices/properties/" + pid + "/units?source=EXPEDIA", "/api/invoices/properties/" + pid + "/units?from=2043-02-01&to=2043-01-01",
                "/api/invoices/units/" + unit + "/reservations?size=ten", "/api/invoices/properties/" + pid + "/export?from=2043-13-01")) {
            MockHttpServletResponse r = call(get(q), o.token(), null);
            assertEquals(400, r.getStatus(), q + " -> " + r.getContentAsString());
            assertErrorShape(r.getContentAsString(), 400);
        }
    }

    @Test
    void lenientCoercionsAreRecordedAndNeverServerErrors() throws Exception {
        TestOwner o = newOwner();
        String pid = createProperty(o.token(), "P", 0);
        String unit = newRoom(o.token());
        String[][] cases = {
                {"capacity as string \"3\"", "/api/properties/" + pid + "/units", "{\"name\":\"R\",\"capacity\":\"3\"}"},
                {"capacity 2.7", "/api/properties/" + pid + "/units", "{\"name\":\"R\",\"capacity\":2.7}"},
                {"capacity true", "/api/properties/" + pid + "/units", "{\"name\":\"R\",\"capacity\":true}"},
                {"name as number", "/api/properties", "{\"name\":12345,\"unitCount\":0}"},
                {"unitCount as \"2\"", "/api/properties", "{\"name\":\"P\",\"unitCount\":\"2\"}"},
                {"enabled \"true\"", "PUT /api/notifications/settings", "{\"enabled\":\"true\"}"},
                {"enabled 1", "PUT /api/notifications/settings", "{\"enabled\":1}"},
                {"duplicate key name", "/api/properties", "{\"name\":\"first\",\"name\":\"second\",\"unitCount\":0}"},
                {"year 10000", "/api/reservations", reservationJson(unit, "+10000-01-01", "+10000-01-03", null)},
                {"stay of 7000 years", "/api/reservations", reservationJson(unit, "2044-01-01", "9999-12-31", null)},
                {"year 0", "/api/reservations", reservationJson(unit, "0000-01-01", "0000-01-02", null)},
                {"negative year", "/api/reservations", reservationJson(unit, "-0001-01-01", "-0001-01-03", null)},
                {"checkIn with time", "/api/reservations", reservationJson(unit, "2045-01-01T10:00:00", "2045-01-03", null)},
        };
        for (String[] c : cases) {
            MockHttpServletRequestBuilder req = c[1].startsWith("PUT ") ? put(c[1].substring(4)) : post(c[1]);
            MockHttpServletResponse r = call(req, o.token(), c[2]);
            System.out.println("AUDIT-OBS coercion " + c[0] + " -> " + r.getStatus() + " " + r.getContentAsString().replaceAll("\\s+", " ")
                    .substring(0, Math.min(160, r.getContentAsString().length())));
            assertTrue(r.getStatus() < 500, c[0] + " gave a server error: " + r.getContentAsString());
            if (r.getStatus() >= 400) assertErrorShape(r.getContentAsString(), r.getStatus());
        }
    }

    @Test
    @Tag("open-finding")
    void anAmountTooLargeForTheDatabaseIsAValidationErrorNotAConflict() throws Exception {
        // Finding API-05 (S4): no @Digits/@DecimalMax on amounts; 1e9 overflows numeric(10,2) and comes back as
        // 409 "This request conflicts with existing data." (code CONFLICT), which the app shows as a clash.
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        expect400(post("/api/reservations"), o.token(), reservationJson(unit, "2043-04-01", "2043-04-02", "\"totalAmount\":1e9"), "VALIDATION_FAILED");
    }

    @Test
    @Tag("open-finding")
    void anAmountWithThreeDecimalsIsRefusedOrSavedExactlyAsAnswered() throws Exception {
        // Finding API-06 (S4): 10.005 is answered back as 10.005, the database stores 10.01; the next read differs.
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        MockHttpServletResponse r = call(post("/api/reservations"), o.token(),
                reservationJson(unit, "2043-05-01", "2043-05-02", "\"totalAmount\":10.005"));
        if (r.getStatus() == 400) return; // refusing 3 decimals is a correct fix
        assertEquals(200, r.getStatus());
        String id = JsonPath.read(r.getContentAsString(), "$.id");
        Object answered = JsonPath.read(r.getContentAsString(), "$.totalAmount");
        Object stored = JsonPath.read(body(send(get("/api/reservations/" + id), o.token(), null)), "$.totalAmount");
        assertEquals(String.valueOf(stored), String.valueOf(answered), "create answered " + answered + ", database holds " + stored);
    }

    @Test
    void extraFieldsInBodiesAreIgnoredMassAssignment() throws Exception {
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        // reservation: server-owned fields cannot be set by the client
        String res = body(send(post("/api/reservations"), o.token(), reservationJson(unit, "2043-06-01", "2043-06-03",
                "\"id\":\"" + UUID.randomUUID() + "\",\"source\":\"BOOKING\",\"priceNeedsReview\":true,"
                        + "\"cancelledAt\":\"2020-01-01T00:00:00Z\",\"createdAt\":\"2000-01-01T00:00:00\",\"owner\":{\"id\":\"x\"},"
                        + "\"unit\":{\"id\":\"" + UUID.randomUUID() + "\"},\"stayRange\":\"[2000-01-01,2100-01-01)\",\"externalUid\":\"x\"")).andExpect(status().isOk()));
        assertEquals("DIRECT", JsonPath.read(res, "$.source"));
        assertEquals(false, JsonPath.read(res, "$.priceNeedsReview"));
        assertNull(JsonPath.read(res, "$.cancelledAt"));
        assertEquals("2043-06-01", JsonPath.read(res, "$.checkIn"));
        assertEquals(unit, JsonPath.read(res, "$.unitId"));
        Object created = jdbc.queryForObject("SELECT created_at FROM reservation WHERE id = ?", Object.class, UUID.fromString(JsonPath.read(res, "$.id")));
        assertFalse(String.valueOf(created).startsWith("2000"), "createdAt taken from the body");

        // registration: role, demo, verification and token version are never taken from the body
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, "{\"email\":\"" + email + "\",\"password\":\"Valid-pass-1\",\"fullName\":\"N\","
                + ACCEPT_TERMS + ",\"role\":\"STAFF\",\"demo\":true,\"emailVerifiedAt\":\"2020-01-01T00:00:00Z\",\"active\":true,"
                + "\"tokenVersion\":99,\"ownerId\":\"" + ownerIdOf(o.email()) + "\",\"owner\":{\"demo\":true},\"id\":\"" + UUID.randomUUID() + "\"}")
                .andExpect(status().isAccepted());
        assertEquals("OWNER", jdbc.queryForObject("SELECT role FROM app_user WHERE email = ?", String.class, email));
        assertNull(jdbc.queryForObject("SELECT email_verified_at FROM app_user WHERE email = ?", Object.class, email));
        assertEquals(0, (int) jdbc.queryForObject("SELECT token_version FROM app_user WHERE email = ?", Integer.class, email));
        assertNotEquals(ownerIdOf(o.email()), ownerIdOf(email));
        assertEquals(false, jdbc.queryForObject("SELECT o.demo FROM owner o JOIN app_user u ON u.owner_id = o.id WHERE u.email = ?", Boolean.class, email));
        sendFrom(randomIp(), post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"Valid-pass-1\"}")
                .andExpect(status().isForbidden());

        // notification settings / change password: only the documented fields count
        send(put("/api/notifications/settings"), o.token(), "{\"enabled\":false,\"demo\":true,\"ownerId\":\"" + UUID.randomUUID() + "\"}")
                .andExpect(status().isOk());
        assertEquals(false, jdbc.queryForObject("SELECT demo FROM owner WHERE id = ?", Boolean.class, ownerIdOf(o.email())));
        int tvBefore = jdbc.queryForObject("SELECT token_version FROM app_user WHERE email = ?", Integer.class, o.email());
        send(post("/api/me/password"), o.token(), "{\"currentPassword\":\"" + o.password() + "\",\"newPassword\":\"Fresh-pass-77\","
                + "\"tokenVersion\":-1,\"email\":\"" + uniqueEmail() + "\",\"role\":\"STAFF\"}").andExpect(status().isOk());
        assertEquals(tvBefore + 1, (int) jdbc.queryForObject("SELECT token_version FROM app_user WHERE email = ?", Integer.class, o.email()));
        assertEquals("OWNER", jdbc.queryForObject("SELECT role FROM app_user WHERE email = ?", String.class, o.email()));
    }

    @Test
    void wrongContentTypesAreRefusedWith415() throws Exception {
        TestOwner o = newOwner();
        for (String ct : List.of("text/plain", "application/x-www-form-urlencoded", "application/xml", "multipart/form-data; boundary=x")) {
            MockHttpServletResponse r = sendRaw(post("/api/properties"), o.token(), ct, "{\"name\":\"P\",\"unitCount\":0}").andReturn().getResponse();
            assertEquals(415, r.getStatus(), ct);
            assertErrorShape(r.getContentAsString(), 415);
        }
        MockHttpServletResponse none = sendRaw(post("/api/properties"), o.token(), null, "{\"name\":\"P\",\"unitCount\":0}").andReturn().getResponse();
        assertEquals(415, none.getStatus());
        MockHttpServletResponse form = mvc.perform(post("/api/auth/login").param("email", o.email()).param("password", o.password())
                .contentType("application/x-www-form-urlencoded")).andReturn().getResponse();
        assertEquals(415, form.getStatus(), "form login must not work");
        send(get("/api/properties"), o.token(), null).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void malformedDeeplyNestedAndHugeBodiesAre400NotServerErrors() throws Exception {
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        for (String b : List.of("{bad json", "", "null", "[]", "\"just a string\"", "{\"name\":\"P\"", "{\"name\":\"P\",}", "\u0000\u0001")) {
            MockHttpServletResponse r = call(post("/api/properties"), o.token(), b);
            assertEquals(400, r.getStatus(), "body <" + b + "> -> " + r.getStatus());
            assertErrorShape(r.getContentAsString(), 400);
        }
        // 100 000 nested arrays / objects
        String deepArray = "[".repeat(100_000) + "]".repeat(100_000);
        MockHttpServletResponse d1 = call(post("/api/properties"), o.token(), deepArray);
        assertEquals(400, d1.getStatus());
        assertErrorShape(d1.getContentAsString(), 400);
        String deepObject = "{\"name\":" + "{\"a\":".repeat(50_000) + "1" + "}".repeat(50_000) + "}";
        MockHttpServletResponse d2 = call(post("/api/properties"), o.token(), deepObject);
        // about 300 KB: since SEC-05 the body limit (256 KB) refuses it with 413 before parsing
        assertTrue(d2.getStatus() == 400 || d2.getStatus() == 413, "deep object -> " + d2.getStatus());
        assertErrorShape(d2.getContentAsString(), d2.getStatus());

        // 8 MB in one field: refused as too long, the server keeps answering
        long t = System.currentTimeMillis();
        MockHttpServletResponse huge = call(post("/api/reservations"), o.token(),
                reservationJson(unit, "2043-07-01", "2043-07-02", "\"notes\":\"" + "n".repeat(8_000_000) + "\""));
        System.out.println("AUDIT-OBS 8 MB body -> " + huge.getStatus() + " in " + (System.currentTimeMillis() - t) + " ms");
        assertTrue(huge.getStatus() == 400 || huge.getStatus() == 413, "8 MB -> " + huge.getStatus()); // 413 since SEC-05
        // a list of 20 000 unit ids in a copy request is answered quickly with 404 (first unknown id), not a 5xx
        String res = createReservation(o.token(), unit, "2043-08-01", "2043-08-02", null);
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i < 20_000; i++) ids.append(i == 0 ? "" : ",").append('"').append(UUID.randomUUID()).append('"');
        MockHttpServletResponse copy = call(post("/api/reservations/" + res + "/copy"), o.token(), "{\"unitIds\":[" + ids + "]}");
        assertTrue(copy.getStatus() == 404 || copy.getStatus() == 400 || copy.getStatus() == 413, "copy with 20 000 ids -> " + copy.getStatus());
        send(get("/api/me"), o.token(), null).andExpect(status().isOk());
    }

    @Test
    void hugeBodyOnARealConnectionIsRefusedWithoutAServerError() throws Exception {
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        var r = live("POST", "/api/reservations", o.token(), "application/json",
                reservationJson(unit, "2043-09-01", "2043-09-02", "\"notes\":\"" + "n".repeat(12_000_000) + "\""));
        System.out.println("AUDIT-OBS 12 MB body over HTTP -> " + r.statusCode());
        assertTrue(r.statusCode() >= 400 && r.statusCode() < 500, "12 MB body -> " + r.statusCode());
        assertNoLeak(r.body());
    }
}
