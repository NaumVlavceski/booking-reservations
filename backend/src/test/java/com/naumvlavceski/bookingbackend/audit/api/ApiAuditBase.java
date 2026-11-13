package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Shared setup of the api-authz audit (Docs/testing/report/api-authz.md). One Spring context for every class in this
 * package: a real Tomcat on a random port (so the real /error dispatch, firewall and verb handling can be observed
 * with a plain HTTP client) plus MockMvc for the bulk of the requests. Mail is the only mock: it stands in for the
 * inbox codes are read from, and it proves which emails were (not) sent.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.contact.to=audit-inbox@example.test")
public abstract class ApiAuditBase extends AuditTestBase {

    /** The test profile's signing secret (application-test.yml app.jwt.secret). Test-only value, not a real secret. */
    protected static final String TEST_JWT_SECRET = "test-only-secret-test-only-secret-test-only-1234";
    protected static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");
    /** Strings that must never reach a client in an error body. */
    protected static final List<String> LEAKS = List.of("org.springframework", "org.hibernate", "java.", "jakarta.",
            "com.naumvlavceski", "Exception", "SQL", "select ", "SELECT ", "postgres", "PSQL", "\tat ", "stackTrace",
            "trace\"", "Caused by");

    @MockitoBean protected EmailService emailService;
    @Autowired protected JdbcTemplate jdbc;
    @LocalServerPort protected int port;

    protected final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    @BeforeEach
    void mailAlwaysWorks() {
        when(emailService.sendNow(any())).thenReturn(true);
    }

    // ---------- requests ----------

    /** Like send(), but from its own client address so per-IP limits only bite where a test wants them to. */
    protected ResultActions sendFrom(String ip, MockHttpServletRequestBuilder req, String token, String jsonBody)
            throws Exception {
        req.with(r -> { r.setRemoteAddr(ip); return r; });
        return send(req, token, jsonBody);
    }

    protected ResultActions sendRaw(MockHttpServletRequestBuilder req, String token, String contentType, String content)
            throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (contentType != null) req.contentType(MediaType.parseMediaType(contentType));
        if (content != null) req.content(content);
        return mvc.perform(req);
    }

    protected static String randomIp() {
        UUID u = UUID.randomUUID();
        return "10." + (Math.abs(u.getMostSignificantBits() % 250) + 1) + "." + (Math.abs(u.getLeastSignificantBits() % 250) + 1)
                + "." + (Math.abs((u.getMostSignificantBits() >> 8) % 250) + 1);
    }

    /** A plain HTTP call against the real embedded Tomcat (real error dispatch, real firewall). */
    protected HttpResponse<String> live(String method, String path, String token, String contentType, String body)
            throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(30))
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        if (token != null) b.header("Authorization", "Bearer " + token);
        if (contentType != null) b.header("Content-Type", contentType);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    // ---------- ids ----------

    protected UUID userIdOf(String email) {
        return appUsers.findFirstByEmailIgnoreCase(email).orElseThrow().getId();
    }

    protected UUID ownerIdOf(String email) {
        return jdbc.queryForObject("SELECT owner_id FROM app_user WHERE lower(email) = lower(?)", UUID.class, email);
    }

    /**
     * A calendar row inserted directly (no DNS lookup and no download). lastSyncedAt = now keeps the background
     * scheduler away from it for 10 minutes, so no test ever reaches booking.com.
     */
    protected String seedCalendar(String unitId, String icsUrl, boolean justSynced) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO external_calendar (id, unit_id, platform, ics_url, last_synced_at, last_error, "
                        + "consecutive_failures, created_at, updated_at) VALUES (?, ?, 'BOOKING', ?, "
                        + (justSynced ? "now()" : "NULL") + ", 'Feed returned HTTP 500', 1, now(), now())",
                id, UUID.fromString(unitId), icsUrl);
        return id.toString();
    }

    protected String seedConflict(String ownerEmail, String unitId, String calendarId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO sync_conflict (id, owner_id, unit_id, external_calendar_id, external_uid, platform, "
                        + "incoming_start, incoming_end, incoming_summary, kind, status, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, 'BOOKING', DATE '2041-01-02', DATE '2041-01-03', 'Imported guest', "
                        + "'NEW_OVERLAP', 'OPEN', now(), now())",
                id, ownerIdOf(ownerEmail), UUID.fromString(unitId), UUID.fromString(calendarId), "uid-" + id);
        return id.toString();
    }

    // ---------- mail ----------

    /** The 6-digit code in the newest email of this type sent to this address. */
    protected String emailedCode(String type, String to) {
        ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService, atLeast(1)).send(any(), eq(type), msg.capture());
        EmailMessage last = msg.getAllValues().stream().filter(m -> m.to().equalsIgnoreCase(to))
                .reduce((a, b) -> b).orElseThrow(() -> new AssertionError("no " + type + " email to " + to));
        Matcher m = CODE.matcher(last.text());
        assertTrue(m.find(), "code in email text");
        return m.group(1);
    }

    protected long emailsTo(String to) {
        ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService, atLeast(0)).send(any(), any(), msg.capture());
        long logged = msg.getAllValues().stream().filter(m -> m.to().equalsIgnoreCase(to)).count();
        ArgumentCaptor<EmailMessage> now = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService, atLeast(0)).sendNow(now.capture());
        return logged + now.getAllValues().stream().filter(m -> m.to().equalsIgnoreCase(to)).count();
    }

    // ---------- tokens ----------

    /** Builds a token like JwtService does, signed with {@code secret}; every claim can be bent by the caller. */
    protected static String jwt(String secret, Map<String, Object> claims, String subject, Date issuedAt, Date expiry) {
        var b = Jwts.builder().subject(subject).claims(claims).issuedAt(issuedAt).expiration(expiry);
        return b.signWith(Keys.hmacShaKeyFor(secret.getBytes())).compact();
    }

    /** A token for this verified user with the given session start / expiry / token version. */
    protected String tokenFor(String email, long sessionStartMs, long expiryMs, int tokenVersion) {
        var user = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        return jwt(TEST_JWT_SECRET, Map.of(
                        "userId", user.getId().toString(),
                        "ownerId", ownerIdOf(email).toString(),
                        "role", "OWNER",
                        "sid_iat", sessionStartMs / 1000,
                        "tv", tokenVersion),
                user.getEmail(), new Date(System.currentTimeMillis()), new Date(expiryMs));
    }

    protected static String b64(String s) {
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    // ---------- tenant isolation ----------

    /** Owner A with one of everything (see TenantFixture). */
    protected TenantFixture ownerWithData() throws Exception {
        TestOwner a = newOwner();
        String property = createProperty(a.token(), "A-Secret-House", 2);
        List<String> rooms = roomIds(a.token(), property);
        String res = createReservation(a.token(), rooms.get(0), "2041-01-01", "2041-01-05",
                "\"guestEmail\":\"a-guest@example.test\",\"totalAmount\":400,\"notes\":\"A private note\"");
        String cancelled = createReservation(a.token(), rooms.get(1), "2041-02-01", "2041-02-03", null);
        jdbc.update("UPDATE reservation SET guest_name = '%_a''s cancelled guest' WHERE id = ?", UUID.fromString(cancelled));
        send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/reservations/" + cancelled),
                a.token(), null);
        String calendar = seedCalendar(rooms.get(0), "https://ical.booking.com/v1/export?t=a-private-feed", true);
        String conflict = seedConflict(a.email(), rooms.get(0), calendar);
        String unitJson = body(send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/units/" + rooms.get(0)),
                a.token(), null));
        return new TenantFixture(a.email(), a.token(), property, rooms.get(0), rooms.get(1), res, cancelled, calendar,
                conflict, JsonPath.read(unitJson, "$.token"));
    }

    protected static String withoutTimestamp(String json) {
        return json.replaceAll("\"timestamp\":\"[^\"]*\"", "\"timestamp\":\"-\"");
    }

    /**
     * Every ID-taking request of the attacker on A's ids gets exactly the answer (status and body) a random unknown
     * id gets, and A's data is unchanged afterwards. Returns the number of request pairs compared.
     */
    protected int assertCannotReachOwnerA(TenantFixture a, String attacker, String attackerProperty, String attackerUnit,
                                          String attackerRes) throws Exception {
        String r = UUID.randomUUID().toString();
        String resBody = reservationJson("%s", "2042-03-01", "2042-03-02", null);
        // {method, path with %s for the target id, body with %s or null}; each row runs once with A's id, once with r
        List<String[]> cases = List.of(
                new String[]{"GET", "/api/properties/%s", null},
                new String[]{"PUT", "/api/properties/%s", "{\"name\":\"hacked\",\"address\":\"x\"}"},
                new String[]{"DELETE", "/api/properties/%s", null},
                new String[]{"GET", "/api/properties/%s/units", null},
                new String[]{"POST", "/api/properties/%s/units", "{\"name\":\"hacked\",\"capacity\":1}"},
                new String[]{"GET", "/api/units/%s", null},
                new String[]{"PUT", "/api/units/%s", "{\"name\":\"hacked\",\"capacity\":1}"},
                new String[]{"DELETE", "/api/units/%s", null},
                new String[]{"GET", "/api/reservations/%s", null},
                new String[]{"PUT", "/api/reservations/%s", reservationJson(attackerUnit, "2042-03-01", "2042-03-02", null)},
                new String[]{"GET", "/api/reservations/%s/available-options", null},
                new String[]{"POST", "/api/reservations/%s/move", "{\"unitId\":\"" + attackerUnit + "\"}"},
                new String[]{"POST", "/api/reservations/%s/copy", "{\"unitIds\":[\"" + attackerUnit + "\"]}"},
                new String[]{"GET", "/api/reservations/%s/unit", null},
                new String[]{"DELETE", "/api/reservations/%s", null},
                new String[]{"GET", "/api/units/%s/calendars", null},
                new String[]{"POST", "/api/units/%s/calendars", "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=hijack\"}"},
                new String[]{"DELETE", "/api/calendars/%s", null},
                new String[]{"POST", "/api/calendars/%s/sync", null},
                new String[]{"POST", "/api/conflicts/%s/dismiss", null},
                new String[]{"GET", "/api/invoices/properties/%s/units", null},
                new String[]{"GET", "/api/invoices/units/%s/reservations", null},
                new String[]{"GET", "/api/invoices/properties/%s/missing-amounts", null},
                new String[]{"GET", "/api/invoices/properties/%s/export", null},
                // A's id inside the attacker's own request (body or query)
                new String[]{"POST", "/api/reservations", resBody},
                new String[]{"PUT", "/api/reservations/" + attackerRes, resBody},
                new String[]{"POST", "/api/reservations/" + attackerRes + "/move", "{\"unitId\":\"%s\"}"},
                new String[]{"POST", "/api/reservations/" + attackerRes + "/copy", "{\"unitIds\":[\"%s\"]}"},
                new String[]{"GET", "/api/reservations?unitId=%s", null},
                new String[]{"GET", "/api/invoices/properties/" + attackerProperty + "/missing-amounts?unitId=%s", null},
                new String[]{"GET", "/api/invoices/properties/" + attackerProperty + "/export?unitId=%s", null});
        int compared = 0;
        for (String[] c : cases) {
            String aId = targetOf(a, c[1], c[2]);
            String[] answers = new String[2];
            int[] statuses = new int[2];
            String[] ids = {aId, r};
            for (int i = 0; i < 2; i++) {
                String path = c[1].contains("%s") ? c[1].formatted(ids[i]) : c[1];
                String bodyJson = c[2] == null ? null : c[2].contains("%s") ? c[2].formatted(ids[i]) : c[2];
                var req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(
                        org.springframework.http.HttpMethod.valueOf(c[0]), path);
                var res = send(req, attacker, bodyJson).andReturn().getResponse();
                statuses[i] = res.getStatus();
                answers[i] = withoutTimestamp(res.getContentAsString());
            }
            String what = c[0] + " " + c[1] + (c[2] == null ? "" : " " + c[2]);
            assertEquals(statuses[1], statuses[0], "status differs for A's id vs unknown id: " + what);
            assertEquals(answers[1], answers[0], "body differs for A's id vs unknown id: " + what);
            assertTrue(statuses[0] == 404 || statuses[0] == 200, what + " -> " + statuses[0]);
            if (statuses[0] == 200) {
                // the list endpoints answer 200: they must be empty for A's id
                assertTrue(answers[0].equals("[]") || answers[0].contains("\"items\":[]"), what + " -> " + answers[0]);
            }
            compared++;
        }
        assertOwnerAUnchanged(a);
        return compared;
    }

    /** Which of A's ids a case targets: chosen by the path/body it starts from. */
    private static String targetOf(TenantFixture a, String path, String body) {
        if (path.startsWith("/api/properties/%s") || path.startsWith("/api/invoices/properties/%s")) return a.propertyId();
        if (path.startsWith("/api/reservations/%s/unit")) return a.unitId();
        if (path.startsWith("/api/reservations/%s")) return a.reservationId();
        if (path.startsWith("/api/calendars/%s")) return a.calendarId();
        if (path.startsWith("/api/conflicts/%s")) return a.conflictId();
        // units, invoices of units, and every case with A's id in the body or the query
        return a.unitId();
    }

    protected void assertOwnerAUnchanged(TenantFixture a) throws Exception {
        String t = a.token();
        var g = (java.util.function.Function<String, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder>)
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders::get;
        assertEquals("A-Secret-House", JsonPath.read(body(send(g.apply("/api/properties/" + a.propertyId()), t, null)), "$.name"));
        String units = body(send(g.apply("/api/properties/" + a.propertyId() + "/units"), t, null));
        assertEquals(2, (int) JsonPath.read(units, "$.length()"));
        assertFalse(units.contains("hacked"));
        String res = body(send(g.apply("/api/reservations/" + a.reservationId()), t, null));
        assertEquals("CONFIRMED", JsonPath.read(res, "$.status"));
        assertEquals(a.unitId(), JsonPath.read(res, "$.unitId"));
        assertEquals("2041-01-01", JsonPath.read(res, "$.checkIn"));
        assertEquals("2041-01-05", JsonPath.read(res, "$.checkOut"));
        assertEquals("A private note", JsonPath.read(res, "$.notes"));
        assertEquals(1, (int) JsonPath.read(body(send(g.apply("/api/reservations"), t, null)), "$.length()"));
        assertEquals(1, (int) JsonPath.read(body(send(g.apply("/api/units/" + a.unitId() + "/calendars"), t, null)), "$.length()"));
        assertEquals(1, (int) JsonPath.read(body(send(g.apply("/api/conflicts"), t, null)), "$.length()"));
        assertEquals(1, (int) JsonPath.read(body(send(g.apply("/api/reservations/cancelled"), t, null)), "$.totalElements"));
        assertEquals(1, (int) jdbc.queryForObject("SELECT count(*) FROM external_calendar WHERE id = ?", Integer.class,
                UUID.fromString(a.calendarId())));
    }

    // ---------- error shape ----------

    /** {timestamp,status,error,message,code} with the given status, and nothing internal in it. */
    protected static void assertErrorShape(String json, int status) {
        assertNotNull(json);
        assertFalse(json.isBlank(), "error body must not be empty (status " + status + ")");
        assertTrue(json.trim().startsWith("{"), "error body must be JSON: " + json);
        Map<String, Object> m = JsonPath.read(json, "$");
        for (String k : List.of("timestamp", "status", "error", "message", "code")) {
            assertTrue(m.containsKey(k), "error body lacks '" + k + "': " + json);
        }
        assertEquals(status, ((Number) m.get("status")).intValue(), json);
        assertNoLeak(json);
    }

    protected static void assertNoLeak(String body) {
        for (String leak : LEAKS) {
            assertFalse(body.contains(leak), "response leaks '" + leak + "': " + body);
        }
    }
}
