package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.mail.UnsubscribeLinks;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 2 matrix, columns "Happy" and "Unauth": every one of the 54 endpoints (42 signed-in, 12 public) and /actuator/health answers its documented status with the
 * documented field names and nothing sensitive, and every one of the 42 signed-in endpoints refuses every kind of
 * missing or bad token with 401.
 */
@SuppressWarnings("unchecked")
class EndpointMatrixAuditTest extends ApiAuditBase {

    @Autowired UnsubscribeLinks unsubscribeLinks;

    /** The 42 endpoints that need a token, with a body that would be valid if the caller were signed in. */
    static List<Object[]> protectedEndpoints() {
        String id = UUID.randomUUID().toString();
        String res = AuditTestBase_reservation(id);
        List<Object[]> e = new ArrayList<>();
        e.add(new Object[]{HttpMethod.GET, "/api/me", null});
        e.add(new Object[]{HttpMethod.POST, "/api/me/password", "{\"currentPassword\":\"Old-password-1\",\"newPassword\":\"New-password-1\"}"});
        e.add(new Object[]{HttpMethod.GET, "/api/me/export", null});
        e.add(new Object[]{HttpMethod.POST, "/api/me/support", "{\"message\":\"hello\"}"});
        e.add(new Object[]{HttpMethod.POST, "/api/me/delete", "{\"password\":\"Old-password-1\",\"confirmation\":\"DELETE\"}"});
        e.add(new Object[]{HttpMethod.GET, "/api/notifications/settings", null});
        e.add(new Object[]{HttpMethod.PUT, "/api/notifications/settings", "{\"enabled\":false}"});
        e.add(new Object[]{HttpMethod.POST, "/api/notifications/test", null});
        e.add(new Object[]{HttpMethod.GET, "/api/properties", null});
        e.add(new Object[]{HttpMethod.GET, "/api/properties/" + id, null});
        e.add(new Object[]{HttpMethod.POST, "/api/properties", "{\"name\":\"P\",\"unitCount\":1}"});
        e.add(new Object[]{HttpMethod.PUT, "/api/properties/" + id, "{\"name\":\"P\"}"});
        e.add(new Object[]{HttpMethod.DELETE, "/api/properties/" + id, null});
        e.add(new Object[]{HttpMethod.GET, "/api/units", null});
        e.add(new Object[]{HttpMethod.GET, "/api/properties/" + id + "/units", null});
        e.add(new Object[]{HttpMethod.GET, "/api/units/" + id, null});
        e.add(new Object[]{HttpMethod.POST, "/api/properties/" + id + "/units", "{\"name\":\"R\",\"capacity\":2}"});
        e.add(new Object[]{HttpMethod.PUT, "/api/units/" + id, "{\"name\":\"R\",\"capacity\":2}"});
        e.add(new Object[]{HttpMethod.DELETE, "/api/units/" + id, null});
        e.add(new Object[]{HttpMethod.GET, "/api/reservations", null});
        e.add(new Object[]{HttpMethod.GET, "/api/reservations/cancelled", null});
        e.add(new Object[]{HttpMethod.GET, "/api/reservations/" + id, null});
        e.add(new Object[]{HttpMethod.POST, "/api/reservations", res});
        e.add(new Object[]{HttpMethod.PUT, "/api/reservations/" + id, res});
        e.add(new Object[]{HttpMethod.GET, "/api/reservations/" + id + "/available-options", null});
        e.add(new Object[]{HttpMethod.POST, "/api/reservations/" + id + "/move", "{\"unitId\":\"" + id + "\"}"});
        e.add(new Object[]{HttpMethod.POST, "/api/reservations/" + id + "/copy", "{\"unitIds\":[\"" + id + "\"]}"});
        e.add(new Object[]{HttpMethod.GET, "/api/reservations/" + id + "/unit", null});
        e.add(new Object[]{HttpMethod.DELETE, "/api/reservations/" + id, null});
        e.add(new Object[]{HttpMethod.GET, "/api/units/" + id + "/calendars", null});
        e.add(new Object[]{HttpMethod.POST, "/api/units/" + id + "/calendars", "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=x\"}"});
        e.add(new Object[]{HttpMethod.DELETE, "/api/calendars/" + id, null});
        e.add(new Object[]{HttpMethod.POST, "/api/calendars/" + id + "/sync", null});
        e.add(new Object[]{HttpMethod.GET, "/api/calendars/health", null});
        e.add(new Object[]{HttpMethod.POST, "/api/calendars/sync-all", null});
        e.add(new Object[]{HttpMethod.GET, "/api/conflicts", null});
        e.add(new Object[]{HttpMethod.POST, "/api/conflicts/" + id + "/dismiss", null});
        e.add(new Object[]{HttpMethod.GET, "/api/invoices/properties", null});
        e.add(new Object[]{HttpMethod.GET, "/api/invoices/properties/" + id + "/units", null});
        e.add(new Object[]{HttpMethod.GET, "/api/invoices/units/" + id + "/reservations", null});
        e.add(new Object[]{HttpMethod.GET, "/api/invoices/properties/" + id + "/missing-amounts", null});
        e.add(new Object[]{HttpMethod.GET, "/api/invoices/properties/" + id + "/export", null});
        return e;
    }

    private static String AuditTestBase_reservation(String unitId) {
        return reservationJson(unitId, "2040-01-01", "2040-01-03", null);
    }

    private static Set<String> keys(String json) {
        Map<String, Object> m = JsonPath.read(json, "$");
        return m.keySet();
    }

    private static void assertNothingSensitive(String json) {
        for (String k : List.of("password", "passwordHash", "tokenVersion", "icsUrl", "ics_url", "ownerId", "codeHash",
                "resetTokenHash", "\"role\"", "\"active\"")) {
            assertFalse(json.contains(k), "response carries '" + k + "': " + json);
        }
    }

    // ---------- Unauth column: all 42 signed-in endpoints x 9 kinds of bad credentials ----------

    @Test
    void every42SignedInEndpointRefusesEveryKindOfMissingOrBadToken() throws Exception {
        TestOwner owner = newOwner();
        long now = System.currentTimeMillis();
        var user = appUsers.findFirstByEmailIgnoreCase(owner.email()).orElseThrow();
        Map<String, Object> claims = Map.of("userId", user.getId().toString(), "ownerId", ownerIdOf(owner.email()).toString(),
                "role", "OWNER", "sid_iat", now / 1000, "tv", user.getTokenVersion());
        String expired = jwt(TEST_JWT_SECRET, claims, owner.email(), new Date(now - 7_200_000), new Date(now - 60_000));
        String otherSecret = jwt("another-secret-another-secret-another-secret-12", claims, owner.email(),
                new Date(now), new Date(now + 600_000));
        String[] parts = owner.token().split("\\.");
        String algNone = b64("{\"alg\":\"none\"}") + "." + parts[1] + ".";
        String payloadSwapped = parts[0] + "." + b64("{\"sub\":\"" + owner.email() + "\",\"userId\":\"" + user.getId()
                + "\",\"tv\":0,\"sid_iat\":" + now / 1000 + ",\"exp\":" + (now / 1000 + 600) + "}") + "." + parts[2];

        Map<String, String> authHeaders = new LinkedHashMap<>();
        authHeaders.put("none", null);
        authHeaders.put("garbage", "Bearer garbage.token.value");
        authHeaders.put("empty bearer", "Bearer ");
        authHeaders.put("basic", "Basic " + java.util.Base64.getEncoder().encodeToString((owner.email() + ":" + owner.password()).getBytes()));
        authHeaders.put("token without Bearer", owner.token());
        authHeaders.put("expired", "Bearer " + expired);
        authHeaders.put("other secret", "Bearer " + otherSecret);
        authHeaders.put("alg none", "Bearer " + algNone);
        authHeaders.put("payload swapped", "Bearer " + payloadSwapped);

        int checked = 0;
        for (Object[] ep : protectedEndpoints()) {
            for (var h : authHeaders.entrySet()) {
                var req = request((HttpMethod) ep[0], (String) ep[1]);
                if (h.getValue() != null) req.header("Authorization", h.getValue());
                if (ep[2] != null) req.contentType("application/json").content((String) ep[2]);
                MvcResult r = mvc.perform(req).andReturn();
                assertEquals(401, r.getResponse().getStatus(), ep[0] + " " + ep[1] + " with " + h.getKey());
                checked++;
            }
        }
        assertEquals(42 * 9, checked);
        // the owner's real token still works, so the 401s above are about the credentials
        send(get("/api/me"), owner.token(), null).andExpect(status().isOk());
    }

    // ---------- Happy column ----------

    @Test
    void authEndpointsAnswerTheirDocumentedShapes() throws Exception {
        String email = uniqueEmail();
        String password = "Pw-" + UUID.randomUUID();
        String reg = body(send(post("/api/auth/register"), null, "{\"email\":\"" + email + "\",\"password\":\"" + password
                + "\",\"fullName\":\"Shape Owner\"," + ACCEPT_TERMS + "}").andExpect(status().isAccepted()));
        assertEquals(Set.of("email", "verificationRequired"), keys(reg));
        assertEquals(true, JsonPath.read(reg, "$.verificationRequired"));

        String resend = body(sendFrom(randomIp(), post("/api/auth/resend-code"), null, "{\"email\":\"" + email + "\"}")
                .andExpect(status().isOk()));
        assertEquals(Set.of("message"), keys(resend));

        String verified = body(send(post("/api/auth/verify-email"), null, "{\"email\":\"" + email + "\",\"code\":\""
                + emailedCode("VERIFY_EMAIL", email) + "\"}").andExpect(status().isOk()));
        assertEquals(Set.of("token", "email", "fullName"), keys(verified));

        String login = body(sendFrom(randomIp(), post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").andExpect(status().isOk()));
        assertEquals(Set.of("token", "email", "fullName"), keys(login));
        String token = JsonPath.read(login, "$.token");
        assertEquals(3, token.split("\\.").length);
        assertNothingSensitive(login);

        String forgot = body(sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + email + "\"}")
                .andExpect(status().isOk()));
        assertEquals(Set.of("message"), keys(forgot));
        String reset = body(send(post("/api/auth/verify-reset-code"), null, "{\"email\":\"" + email + "\",\"code\":\""
                + emailedCode("PASSWORD_RESET", email) + "\"}").andExpect(status().isOk()));
        assertEquals(Set.of("resetToken"), keys(reset));
        String done = body(send(post("/api/auth/reset-password"), null, "{\"resetToken\":\"" + JsonPath.read(reset, "$.resetToken")
                + "\",\"newPassword\":\"Changed-" + UUID.randomUUID() + "\"}").andExpect(status().isOk()));
        assertEquals(Set.of("message"), keys(done));
        // the reset ended the session signed in before it
        send(get("/api/me"), token, null).andExpect(status().isUnauthorized());

        String demo = body(sendFrom(randomIp(), post("/api/auth/demo"), null, null).andExpect(status().isOk()));
        assertEquals(Set.of("token", "email", "fullName"), keys(demo));
        send(get("/api/me"), JsonPath.read(demo, "$.token"), null).andExpect(jsonPath("$.demo").value(true));
    }

    @Test
    void accountNotificationContactAndPublicEndpointsAnswerTheirDocumentedShapes() throws Exception {
        TestOwner o = newOwner();
        String me = body(send(get("/api/me"), o.token(), null).andExpect(status().isOk()));
        assertEquals(Set.of("email", "fullName", "termsVersion", "privacyVersion", "termsAcceptedAt", "demo"), keys(me));
        assertNothingSensitive(me);

        String unit = newRoom(o.token());
        createReservation(o.token(), unit, "2040-05-01", "2040-05-03", "\"guestEmail\":\"g@example.test\"");
        seedCalendar(unit, "https://ical.booking.com/v1/export?t=secret-feed-key", true);
        var export = send(get("/api/me/export"), o.token(), null).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment")))
                .andReturn().getResponse().getContentAsString();
        assertEquals("roomtrack-export-v1", JsonPath.read(export, "$.format"));
        String feedToken = JsonPath.read(body(send(get("/api/units/" + unit), o.token(), null)), "$.token");
        assertFalse(export.contains(feedToken), "export carries the feed token");
        assertFalse(export.contains("secret-feed-key"), "export carries the Booking.com link");
        assertFalse(export.contains("$2a$") || export.contains("$2b$"), "export carries a password hash");

        String support = body(send(post("/api/me/support"), o.token(), "{\"message\":\"Need help\"}").andExpect(status().isOk()));
        assertEquals(Set.of("message"), keys(support));

        assertEquals(Set.of("enabled"), keys(body(send(get("/api/notifications/settings"), o.token(), null).andExpect(status().isOk()))));
        send(put("/api/notifications/settings"), o.token(), "{\"enabled\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));
        String test = body(send(post("/api/notifications/test"), o.token(), null).andExpect(status().isAccepted()));
        assertEquals(Set.of("status", "to"), keys(test));
        assertEquals(o.email(), JsonPath.read(test, "$.to"));
        send(post("/api/notifications/test"), o.token(), null).andExpect(status().isTooManyRequests());

        String link = unsubscribeLinks.url(ownerIdOf(o.email()));
        String unsubToken = link.substring(link.indexOf("token=") + 6);
        sendFrom(randomIp(), get("/api/notifications/unsubscribe").param("token", java.net.URLDecoder.decode(unsubToken, "UTF-8")), null, null)
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("<form")));
        sendFrom(randomIp(), post("/api/notifications/unsubscribe").param("token", java.net.URLDecoder.decode(unsubToken, "UTF-8")), null, null)
                .andExpect(status().isOk());
        send(get("/api/notifications/settings"), o.token(), null).andExpect(jsonPath("$.enabled").value(false));

        String contact = body(sendFrom(randomIp(), post("/api/contact"), null,
                "{\"email\":\"visitor@example.test\",\"subject\":\"Hi\",\"message\":\"Question\"}").andExpect(status().isOk()));
        assertEquals(Set.of("message"), keys(contact));

        sendFrom(randomIp(), get("/api/ical/" + feedToken + ".ics"), null, null).andExpect(status().isOk())
                .andExpect(header().string("Content-Type", org.hamcrest.Matchers.startsWith("text/calendar")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("BEGIN:VCALENDAR")))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("g@example.test"))));

        String health = body(send(get("/actuator/health"), null, null).andExpect(status().isOk()));
        assertEquals("UP", JsonPath.read(health, "$.status"));
        assertFalse(health.contains("components") || health.contains("details") || health.contains("db"), health);

        // delete last: it ends the session
        send(post("/api/me/delete"), o.token(), "{\"password\":\"" + o.password() + "\",\"confirmation\":\"DELETE\"}")
                .andExpect(status().isNoContent());
        send(get("/api/me"), o.token(), null).andExpect(status().isUnauthorized());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM app_user WHERE lower(email)=lower(?)", Integer.class, o.email()));
    }

    @Test
    void passwordChangeAnswersAFreshTokenAndEndsOtherSessions() throws Exception {
        TestOwner o = newOwner();
        String other = login(o.email(), o.password());
        String fresh = body(send(post("/api/me/password"), o.token(), "{\"currentPassword\":\"" + o.password()
                + "\",\"newPassword\":\"Another-" + UUID.randomUUID() + "\"}").andExpect(status().isOk()));
        assertEquals(Set.of("token", "email", "fullName"), keys(fresh));
        send(get("/api/me"), other, null).andExpect(status().isUnauthorized());
        send(get("/api/me"), o.token(), null).andExpect(status().isUnauthorized());
        send(get("/api/me"), JsonPath.read(fresh, "$.token"), null).andExpect(status().isOk());
    }

    @Test
    void propertyAndUnitEndpointsAnswerTheirDocumentedShapes() throws Exception {
        TestOwner o = newOwner();
        String created = body(send(post("/api/properties"), o.token(), "{\"name\":\"Lake\",\"address\":\"1 St\",\"unitCount\":2}")
                .andExpect(status().isOk()));
        assertEquals(Set.of("id", "name", "address", "createdAt"), keys(created));
        String pid = JsonPath.read(created, "$.id");
        send(get("/api/properties"), o.token(), null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        assertEquals(Set.of("id", "name", "address", "createdAt"), keys(body(send(get("/api/properties/" + pid), o.token(), null))));
        send(put("/api/properties/" + pid), o.token(), "{\"name\":\"Lake 2\",\"address\":\"2 St\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lake 2"));

        String units = body(send(get("/api/properties/" + pid + "/units"), o.token(), null).andExpect(status().isOk()));
        assertEquals(2, (int) JsonPath.read(units, "$.length()"));
        String unit = body(send(post("/api/properties/" + pid + "/units"), o.token(), "{\"name\":\"Attic\",\"capacity\":3}")
                .andExpect(status().isOk()));
        assertEquals(Set.of("id", "propertyId", "name", "capacity", "createdAt", "token"), keys(unit));
        assertTrue(((String) JsonPath.read(unit, "$.token")).matches("[0-9a-f]{64}"));
        String uid = JsonPath.read(unit, "$.id");
        send(get("/api/units"), o.token(), null).andExpect(jsonPath("$.length()").value(3));
        assertEquals(Set.of("id", "propertyId", "name", "capacity", "createdAt", "token"), keys(body(send(get("/api/units/" + uid), o.token(), null))));
        send(put("/api/units/" + uid), o.token(), "{\"name\":\"Attic 2\",\"capacity\":4}").andExpect(jsonPath("$.capacity").value(4));
        send(delete("/api/units/" + uid), o.token(), null).andExpect(status().isNoContent());
        send(get("/api/units/" + uid), o.token(), null).andExpect(status().isNotFound());
        send(delete("/api/properties/" + pid), o.token(), null).andExpect(status().isNoContent());
        send(get("/api/units"), o.token(), null).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void reservationEndpointsAnswerTheirDocumentedShapes() throws Exception {
        TestOwner o = newOwner();
        String pid = createProperty(o.token(), "House", 3);
        List<String> rooms = roomIds(o.token(), pid);
        String created = body(send(post("/api/reservations"), o.token(), reservationJson(rooms.get(0), "2040-06-01", "2040-06-04",
                "\"totalAmount\":120.50,\"guestsCount\":2")).andExpect(status().isOk()));
        Set<String> resKeys = Set.of("id", "unitId", "checkIn", "checkOut", "status", "source", "guestName", "guestEmail",
                "guestPhone", "guestsCount", "pricePerGuest", "nightlyRate", "totalAmount", "notes", "priceNeedsReview", "cancelledAt");
        assertEquals(resKeys, keys(created));
        assertNothingSensitive(created);
        String rid = JsonPath.read(created, "$.id");

        send(get("/api/reservations"), o.token(), null).andExpect(jsonPath("$.length()").value(1));
        send(get("/api/reservations?unitId=" + rooms.get(0) + "&status=CONFIRMED"), o.token(), null).andExpect(jsonPath("$.length()").value(1));
        assertEquals(resKeys, keys(body(send(get("/api/reservations/" + rid), o.token(), null))));
        send(put("/api/reservations/" + rid), o.token(), reservationJson(rooms.get(0), "2040-06-01", "2040-06-05", null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.checkOut").value("2040-06-05"));
        String options = body(send(get("/api/reservations/" + rid + "/available-options"), o.token(), null).andExpect(status().isOk()));
        assertEquals(2, (int) JsonPath.read(options, "$.length()"));
        assertEquals(Set.of("unitId", "name"), ((Map<String, Object>) JsonPath.read(options, "$[0]")).keySet());
        send(post("/api/reservations/" + rid + "/move"), o.token(), "{\"unitId\":\"" + rooms.get(1) + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.unitId").value(rooms.get(1)));
        send(post("/api/reservations/" + rid + "/copy"), o.token(), "{\"unitIds\":[\"" + rooms.get(2) + "\"]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].totalAmount").doesNotExist());
        send(get("/api/reservations/" + rooms.get(1) + "/unit"), o.token(), null).andExpect(jsonPath("$.length()").value(1));
        send(delete("/api/reservations/" + rid), o.token(), null).andExpect(status().isNoContent());
        send(delete("/api/reservations/" + rid), o.token(), null).andExpect(status().isNoContent()); // idempotent
        String page = body(send(get("/api/reservations/cancelled"), o.token(), null).andExpect(status().isOk()));
        assertEquals(Set.of("items", "page", "size", "totalElements", "totalPages"), keys(page));
        assertEquals(1, (int) JsonPath.read(page, "$.totalElements"));
        // PUT with status CANCELLED answers 204 (documented), restore answers 200
        String other = createReservation(o.token(), rooms.get(0), "2040-07-01", "2040-07-02", null);
        send(put("/api/reservations/" + other), o.token(), reservationJson(rooms.get(0), "2040-07-01", "2040-07-02", "\"status\":\"CANCELLED\""))
                .andExpect(status().isNoContent());
        send(put("/api/reservations/" + other), o.token(), reservationJson(rooms.get(0), "2040-07-01", "2040-07-02", "\"status\":\"CONFIRMED\""))
                .andExpect(status().isOk());
    }

    @Test
    void calendarConflictAndInvoiceEndpointsAnswerTheirDocumentedShapes() throws Exception {
        TestOwner o = newOwner();
        String pid = createProperty(o.token(), "House", 2);
        List<String> rooms = roomIds(o.token(), pid);
        createReservation(o.token(), rooms.get(0), "2040-08-01", "2040-08-03", "\"totalAmount\":200");

        // connect (DNS lookup of ical.booking.com only; the row is then marked synced so nothing downloads it)
        String cal = body(send(post("/api/units/" + rooms.get(0) + "/calendars"), o.token(),
                "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=audit-shape\"}").andExpect(status().isOk()));
        jdbc.update("UPDATE external_calendar SET last_synced_at = now() WHERE id = ?", UUID.fromString(JsonPath.read(cal, "$.id")));
        Set<String> calKeys = Set.of("id", "unitId", "unitName", "platform", "lastSyncedAt", "lastSuccessAt", "lastError", "consecutiveFailures");
        assertEquals(calKeys, keys(cal));
        assertFalse(cal.contains("audit-shape"), "calendar answer echoes the secret link");
        send(get("/api/units/" + rooms.get(0) + "/calendars"), o.token(), null).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].icsUrl").doesNotExist());
        send(post("/api/calendars/" + JsonPath.read(cal, "$.id") + "/sync"), o.token(), null).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
        send(delete("/api/calendars/" + JsonPath.read(cal, "$.id")), o.token(), null).andExpect(status().isNoContent());

        // a calendar on an unresolvable host: sync answers 200 with lastError, no network beyond a DNS miss
        String failing = seedCalendar(rooms.get(1), "https://feed.audit.invalid/x.ics", false);
        String synced = body(send(post("/api/calendars/" + failing + "/sync"), o.token(), null).andExpect(status().isOk()));
        assertEquals(calKeys, keys(synced));
        assertNotNull(JsonPath.read(synced, "$.lastError"));
        send(get("/api/calendars/health"), o.token(), null).andExpect(jsonPath("$[*].id", org.hamcrest.Matchers.hasItem(failing)));
        String all = body(send(post("/api/calendars/sync-all"), o.token(), null).andExpect(status().isOk()));
        assertEquals(Set.of("triggered", "skipped", "total"), keys(all));

        String conflict = seedConflict(o.email(), rooms.get(1), failing);
        String list = body(send(get("/api/conflicts"), o.token(), null).andExpect(status().isOk()));
        assertEquals(1, (int) JsonPath.read(list, "$.length()"));
        assertEquals(Set.of("id", "unitId", "unitName", "platform", "incomingStart", "incomingEnd", "incomingSummary",
                "conflictingReservationId", "kind", "createdAt"), ((Map<String, Object>) JsonPath.read(list, "$[0]")).keySet());
        send(post("/api/conflicts/" + conflict + "/dismiss"), o.token(), null).andExpect(status().isNoContent());
        send(get("/api/conflicts"), o.token(), null).andExpect(jsonPath("$.length()").value(0));

        String inv = body(send(get("/api/invoices/properties"), o.token(), null).andExpect(status().isOk()));
        assertEquals(Set.of("propertyId", "propertyName", "unitCount"), ((Map<String, Object>) JsonPath.read(inv, "$[0]")).keySet());
        send(get("/api/invoices/properties/" + pid + "/units?from=2040-01-01&to=2040-12-31"), o.token(), null).andExpect(status().isOk());
        send(get("/api/invoices/units/" + rooms.get(0) + "/reservations?from=2040-01-01&to=2040-12-31&page=0&size=10"), o.token(), null)
                .andExpect(status().isOk());
        send(get("/api/invoices/properties/" + pid + "/missing-amounts?unitId=" + rooms.get(1)), o.token(), null).andExpect(status().isOk());
        var xlsx = send(get("/api/invoices/properties/" + pid + "/export?from=2040-01-01&to=2040-12-31"), o.token(), null)
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andReturn().getResponse();
        byte[] bytes = xlsx.getContentAsByteArray();
        assertTrue(bytes.length > 4 && bytes[0] == 'P' && bytes[1] == 'K', "xlsx is a zip");
        assertTrue(xlsx.getContentType().contains("spreadsheetml"), xlsx.getContentType());
    }
}
