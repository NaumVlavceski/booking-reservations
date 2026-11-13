package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 4 error format: every error is {timestamp,status,error,message,code} with nothing internal in it. Error
 * paths that leave Spring MVC (401 from the entry point, firewall rejections, the container's own errors) are
 * checked over a real HTTP connection, because MockMvc does not run the servlet container's /error dispatch.
 */
class ErrorFormatAuditTest extends ApiAuditBase {

    @Test
    void mvcErrorsAllUseTheStandardShape() throws Exception {
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        createReservation(o.token(), unit, "2044-01-01", "2044-01-05", null);
        MockHttpServletResponse r;

        r = send(get("/api/properties/" + UUID.randomUUID()), o.token(), null).andReturn().getResponse();
        assertEquals(404, r.getStatus()); assertErrorShape(r.getContentAsString(), 404);
        assertEquals("NOT_FOUND", JsonPath.read(r.getContentAsString(), "$.code"));

        r = send(get("/api/properties/not-a-uuid"), o.token(), null).andReturn().getResponse();
        assertEquals(400, r.getStatus()); assertErrorShape(r.getContentAsString(), 400);

        r = send(post("/api/properties"), o.token(), "{oops").andReturn().getResponse();
        assertEquals(400, r.getStatus()); assertErrorShape(r.getContentAsString(), 400);

        r = send(post("/api/properties"), o.token(), "{\"name\":\"\"}").andReturn().getResponse();
        assertEquals(400, r.getStatus()); assertErrorShape(r.getContentAsString(), 400);
        assertNotNull(JsonPath.read(r.getContentAsString(), "$.fieldErrors.name"));

        r = send(patch("/api/properties"), o.token(), "{}").andReturn().getResponse();
        assertEquals(405, r.getStatus()); assertErrorShape(r.getContentAsString(), 405);

        r = sendRaw(post("/api/properties"), o.token(), "text/plain", "x").andReturn().getResponse();
        assertEquals(415, r.getStatus()); assertErrorShape(r.getContentAsString(), 415);

        r = send(get("/api/does-not-exist"), o.token(), null).andReturn().getResponse();
        assertEquals(404, r.getStatus()); assertErrorShape(r.getContentAsString(), 404);

        r = send(post("/api/reservations"), o.token(), reservationJson(unit, "2044-01-03", "2044-01-04", null)).andReturn().getResponse();
        assertEquals(409, r.getStatus()); assertErrorShape(r.getContentAsString(), 409);
        assertEquals("DATES_TAKEN", JsonPath.read(r.getContentAsString(), "$.code"));

        r = sendFrom(randomIp(), get("/api/notifications/unsubscribe"), null, null).andReturn().getResponse();
        assertEquals(400, r.getStatus()); // missing token: a Spring MVC error, standard shape
        assertErrorShape(r.getContentAsString(), 400);

        r = sendFrom(randomIp(), post("/api/auth/login"), null, "{\"email\":\"" + o.email() + "\",\"password\":\"Wrong-123\"}").andReturn().getResponse();
        assertEquals(401, r.getStatus());
        assertNoLeak(r.getContentAsString());
        // wrong credentials deliberately carry no code (documented in GlobalExceptionHandler)
        assertEquals("Invalid email or password", JsonPath.read(r.getContentAsString(), "$.message"));
    }

    @Test
    @Tag("open-finding")
    void calendarAndTestEmailErrorsUseTheStandardShape() throws Exception {
        // Finding API-07 (S20 + calendar endpoints): POST /api/units/{id}/calendars answers 400/409 with only
        // {message}, POST /api/calendars/{id}/sync answers 429 with only {message}, and POST /api/notifications/test
        // answers 429 {status:"rate_limited"}: no code/status/timestamp, so the frontend cannot pick wording by code.
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        MockHttpServletResponse notBooking = send(post("/api/units/" + unit + "/calendars"), o.token(),
                "{\"icsUrl\":\"https://example.com/feed.ics\"}").andReturn().getResponse();
        String cal = seedCalendar(unit, "https://feed.audit.invalid/c.ics", true);
        MockHttpServletResponse second = send(post("/api/units/" + unit + "/calendars"), o.token(),
                "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=again\"}").andReturn().getResponse();
        MockHttpServletResponse cooldown = send(post("/api/calendars/" + cal + "/sync"), o.token(), null).andReturn().getResponse();
        send(post("/api/notifications/test"), o.token(), null).andExpect(status().isAccepted());
        MockHttpServletResponse testAgain = send(post("/api/notifications/test"), o.token(), null).andReturn().getResponse();
        assertAll(
                () -> assertErrorShape(notBooking.getContentAsString(), 400),
                () -> assertErrorShape(second.getContentAsString(), 409),
                () -> assertErrorShape(cooldown.getContentAsString(), 429),
                () -> assertErrorShape(testAgain.getContentAsString(), 429));
    }

    @Test
    @Tag("open-finding")
    void unauthenticatedCallsGetTheStandardJson401() throws Exception {
        // Finding API-04 (S10): UnauthorizedEntryPoint uses response.sendError(401); the container's /error dispatch
        // is itself not permitted for anonymous callers, so the 401 body is not the documented JSON.
        for (String path : List.of("/api/me", "/api/properties", "/api/does-not-exist")) {
            HttpResponse<String> r = live("GET", path, null, null, null);
            assertEquals(401, r.statusCode(), path);
            assertTrue(r.headers().firstValue("Content-Type").orElse("").startsWith("application/json"),
                    path + " 401 content type: " + r.headers().firstValue("Content-Type").orElse("(none)"));
            assertErrorShape(r.body(), 401);
        }
    }

    @Test
    void realConnectionErrorsNeverLeakInternalsAndAreNever5xx() throws Exception {
        TestOwner o = newOwner();
        // signed-in errors through the real container
        String[][] cases = {
                {"GET", "/api/properties/" + UUID.randomUUID(), "404"},
                {"GET", "/api/properties/not-a-uuid", "400"},
                {"GET", "/api/nope", "404"},
                {"PATCH", "/api/properties", "405"},
                {"DELETE", "/api/properties", "405"},
                {"GET", "/api/health", "404"},
        };
        for (String[] c : cases) {
            HttpResponse<String> r = live(c[0], c[1], o.token(), null, null);
            System.out.println("AUDIT-OBS live " + c[0] + " " + c[1] + " (signed in) -> " + r.statusCode() + " " + r.body());
            assertEquals(Integer.parseInt(c[2]), r.statusCode(), c[0] + " " + c[1]);
            assertErrorShape(r.body(), r.statusCode());
        }
        HttpResponse<String> bad = live("POST", "/api/properties", o.token(), "application/json", "{\"name\":");
        assertEquals(400, bad.statusCode());
        assertErrorShape(bad.body(), 400);

        // anonymous and firewall/container-level errors: whatever the status, no 5xx and nothing internal
        String[][] raw = {
                {"GET", "/api/health"}, {"GET", "/api/properties/..%2f..%2fetc"}, {"GET", "/api//properties"},
                {"GET", "/api/properties;jsessionid=x"}, {"GET", "/api/%2e%2e/actuator/env"}, {"GET", "/api/ical/%00.ics"},
                {"POST", "/api/auth/login"}, {"GET", "/api/ical/" + "a".repeat(5000) + ".ics"},
        };
        for (String[] c : raw) {
            for (String token : new String[]{null, o.token()}) {
                HttpResponse<String> r = live(c[0], c[1], token, c[0].equals("POST") ? "application/json" : null,
                        c[0].equals("POST") ? "{" : null);
                System.out.println("AUDIT-OBS live " + c[0] + " " + c[1].substring(0, Math.min(60, c[1].length()))
                        + (token == null ? " (anonymous)" : " (signed in)") + " -> " + r.statusCode() + " "
                        + r.body().substring(0, Math.min(200, r.body().length())));
                assertTrue(r.statusCode() < 500, c[1] + " -> " + r.statusCode());
                assertNoLeak(r.body());
            }
        }
        // /error called directly: anonymous 401; signed in it answers 500 {"status":999,"error":"None"} (API-09)
        HttpResponse<String> err = live("GET", "/error", o.token(), null, null);
        System.out.println("AUDIT-OBS live GET /error (signed in) -> " + err.statusCode() + " " + err.body());
        assertNoLeak(err.body());
    }

    @Test
    @Tag("open-finding")
    void hugePageNumbersAreClampedOrRefusedNotServerErrors() throws Exception {
        // Finding API-08: page is only clamped at 0 from below; page=2147483647 with size>1 overflows Spring Data's
        // offset ("Page offset exceeds Integer.MAX_VALUE") and answers 500 INTERNAL, on every paged list.
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        String pid = jdbc.queryForObject("SELECT property_id FROM unit WHERE id = ?::uuid", String.class, unit);
        int s1 = send(get("/api/reservations/cancelled?page=2147483647&size=100"), o.token(), null).andReturn().getResponse().getStatus();
        int s2 = send(get("/api/invoices/units/" + unit + "/reservations?page=2147483647&size=100"), o.token(), null).andReturn().getResponse().getStatus();
        int s3 = send(get("/api/invoices/properties/" + pid + "/missing-amounts?page=2147483647&size=100"), o.token(), null).andReturn().getResponse().getStatus();
        System.out.println("AUDIT-OBS huge page -> cancelled " + s1 + ", unit reservations " + s2 + ", missing amounts " + s3);
        assertAll(() -> assertTrue(s1 < 500, "cancelled -> " + s1), () -> assertTrue(s2 < 500, "unit reservations -> " + s2),
                () -> assertTrue(s3 < 500, "missing amounts -> " + s3));
    }

    @Test
    @Tag("open-finding")
    void callingErrorDirectlyIsNotAServerError() throws Exception {
        // Finding API-09 (Info): GET /error with a valid token answers 500 {"timestamp","status":999,"error":"None"}
        // (Spring Boot's BasicErrorController without an error in the request). No data leaks; noise in monitoring.
        TestOwner o = newOwner();
        HttpResponse<String> err = live("GET", "/error", o.token(), null, null);
        assertTrue(err.statusCode() < 500, "/error -> " + err.statusCode() + " " + err.body());
    }
}
