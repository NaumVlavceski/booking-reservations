package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletResponse;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 4 injection: SQL meta characters through every query/path parameter that reaches a native query or JPQL
 * (inventory §4.3), LIKE wildcards in the cancelled-bookings search, JSON and template payloads stored and echoed
 * literally, and CR/LF in user text not forging log lines.
 */
@ExtendWith(OutputCaptureExtension.class)
class InjectionAuditTest extends ApiAuditBase {

    static final List<String> SQL = List.of("' OR '1'='1", "' OR 1=1--", "%' OR '1'='1' --", "'; DROP TABLE reservation;--",
            "\\'; SELECT pg_sleep(5);--", "1) OR (1=1", "' UNION SELECT email,password_hash FROM app_user--", "\"", "\\", "!%", "$$");

    private static String q(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /** GET of an already-encoded URL (MockMvc would otherwise encode the % signs a second time). */
    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder u(String encoded) {
        return get(java.net.URI.create(encoded));
    }

    @Test
    void sqlPayloadsInQueryAndPathParametersAreDataNotSql() throws Exception {
        TenantFixture a = ownerWithData();
        TestOwner b = newOwner();
        String bUnit = newRoom(b.token());
        String bProperty = jdbc.queryForObject("SELECT property_id FROM unit WHERE id = ?::uuid", String.class, bUnit);
        for (String p : SQL) {
            long t = System.currentTimeMillis();
            String page = body(send(u("/api/reservations/cancelled?name=" + q(p)), b.token(), null).andExpect(status().isOk()));
            assertEquals(0, (int) JsonPath.read(page, "$.totalElements"), p);
            assertTrue(System.currentTimeMillis() - t < 4000, "pg_sleep ran? " + p);
            for (String path : List.of("/api/reservations/cancelled?checkInFrom=" + q(p), "/api/reservations?unitId=" + q(p),
                    "/api/reservations?status=" + q(p), "/api/invoices/properties/" + bProperty + "/units?from=" + q(p),
                    "/api/invoices/properties/" + bProperty + "/units?status=" + q(p),
                    "/api/invoices/properties/" + bProperty + "/missing-amounts?source=" + q(p),
                    "/api/invoices/units/" + bUnit + "/reservations?to=" + q(p),
                    "/api/invoices/properties/" + bProperty + "/export?unitId=" + q(p),
                    "/api/properties/" + q(p), "/api/units/" + q(p), "/api/reservations/" + q(p))) {
                MockHttpServletResponse r = send(u(path), b.token(), null).andReturn().getResponse();
                assertTrue(r.getStatus() == 400 || r.getStatus() == 404, path + " -> " + r.getStatus());
                assertNoLeak(r.getContentAsString());
            }
            MockHttpServletResponse feed = sendFrom(randomIp(), u("/api/ical/" + q(p) + ".ics"), null, null).andReturn().getResponse();
            assertTrue(feed.getStatus() == 404 || feed.getStatus() == 400, "feed " + p + " -> " + feed.getStatus());
            MockHttpServletResponse login = sendFrom(randomIp(), post("/api/auth/login"), null,
                    "{\"email\":\"" + a.email().replace("@", p.replace("\\", "\\\\").replace("\"", "\\\"") + "@") + "\",\"password\":\"x' OR '1'='1\"}")
                    .andReturn().getResponse();
            assertTrue(login.getStatus() == 401 || login.getStatus() == 400, "login " + p + " -> " + login.getStatus());
        }
        // the tables are all still there and A's data is intact
        assertEquals(1, (int) jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_name = 'reservation'", Integer.class));
        assertOwnerAUnchanged(a);
    }

    @Test
    void likeWildcardsInTheNameSearchMatchLiterallyAndOnlyTheOwnersRows() throws Exception {
        ownerWithData(); // A has a cancelled guest called "%_a's cancelled guest"
        TestOwner b = newOwner();
        String unit = newRoom(b.token());
        String[] names = {"%off", "_under", "'quote", "!bang", "plain", "\\back"};
        int day = 1;
        for (String n : names) {
            String id = createReservation(b.token(), unit, "2045-03-" + String.format("%02d", day), "2045-03-" + String.format("%02d", day + 1),
                    "\"guestName\":\"" + n.replace("\\", "\\\\") + "\"").toString();
            send(delete("/api/reservations/" + id), b.token(), null).andExpect(status().isNoContent());
            day += 2;
        }
        // the JSON above carried guestName twice (helper adds "Guest"); the last one wins, check it really was stored
        assertEquals(6, (int) JsonPath.read(body(send(get("/api/reservations/cancelled?size=100"), b.token(), null)), "$.totalElements"));
        for (String n : names) {
            String page = body(send(u("/api/reservations/cancelled?name=" + q(n.substring(0, 1))), b.token(), null).andExpect(status().isOk()));
            assertEquals(1, (int) JsonPath.read(page, "$.totalElements"), "search '" + n.charAt(0) + "' -> " + page);
            assertEquals(n, JsonPath.read(page, "$.items[0].guestName"));
        }
        String all = body(send(u("/api/reservations/cancelled?name=" + q("%_")), b.token(), null));
        assertEquals(0, (int) JsonPath.read(all, "$.totalElements"), "'%_' must not match everything: " + all);
    }

    @Test
    void jsonHtmlAndTemplatePayloadsAreStoredAndAnsweredLiterally() throws Exception {
        TestOwner o = newOwner();
        String unit = newRoom(o.token());
        List<String> payloads = List.of("\",\"ownerId\":\"00000000-0000-0000-0000-000000000000", "<script>alert(1)</script>",
                "${7*7}", "{{7*7}}", "#{7*7}", "<%= 7*7 %>", "=HYPERLINK(\"http://x\")", "Ана Петрова 😀", "line1\nline2");
        for (String p : payloads) {
            String jsonText = p.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
            String prop = body(send(post("/api/properties"), o.token(), "{\"name\":\"" + jsonText + "\",\"unitCount\":0}").andExpect(status().isOk()));
            assertEquals(p, JsonPath.read(prop, "$.name"));
            String json = reservationJson(unit, "2046-01-01", "2046-01-02", null).replace("\"guestName\":\"Guest\"", "\"guestName\":\"" + jsonText + "\"");
            String res = body(send(post("/api/reservations"), o.token(), json).andExpect(status().isOk()));
            assertEquals(p, JsonPath.read(res, "$.guestName"));
            assertFalse(res.contains("\"ownerId\""), "JSON injection created a field: " + res);
            send(delete("/api/reservations/" + JsonPath.read(res, "$.id")), o.token(), null).andExpect(status().isNoContent());
        }
        // the unsubscribe page reflects nothing from an invalid token
        String page = body(sendFrom(randomIp(), get("/api/notifications/unsubscribe").param("token", "<script>alert(1)</script>"), null, null)
                .andExpect(status().isBadRequest()));
        assertFalse(page.contains("<script>"), page);
    }

    @Test
    void crLfInUserTextDoesNotForgeLogLines(CapturedOutput output) throws Exception {
        TestOwner o = newOwner();
        String forged = "FORGED-LOG-LINE-" + System.nanoTime();
        String evil = "x\\r\\n2026-11-11T00:00:00.000Z ERROR 1 --- [main] c.n.b.Security : " + forged;
        String pid = JsonPath.read(body(send(post("/api/properties"), o.token(), "{\"name\":\"" + evil + "\",\"unitCount\":1}")
                .andExpect(status().isOk())), "$.id");
        String unit = roomIds(o.token(), pid).getFirst();
        send(post("/api/reservations"), o.token(), reservationJson(unit, "2046-02-01", "2046-02-02", null)
                .replace("\"guestName\":\"Guest\"", "\"guestName\":\"" + evil + "\",\"notes\":\"" + evil + "\"")).andExpect(status().isOk());
        sendFrom(randomIp(), post("/api/auth/login"), null, "{\"email\":\"" + evil + "@x.test\",\"password\":\"" + evil + "\"}");
        sendFrom(randomIp(), post("/api/contact"), null, "{\"email\":\"v@example.test\",\"subject\":\"" + evil + "\",\"message\":\"" + evil + "\"}");
        sendFrom(randomIp(), u("/api/ical/" + q(evil) + ".ics"), null, null);
        send(u("/api/reservations/cancelled?name=" + q(evil.replace("\\r\\n", "\r\n"))), o.token(), null);
        for (String line : output.getAll().split("\\R")) {
            assertFalse(line.startsWith("2026-11-11T00:00:00.000Z ERROR") && line.contains(forged), "forged log line: " + line);
        }
        System.out.println("AUDIT-OBS user text reached the log: " + output.getAll().contains(forged));
    }
}
