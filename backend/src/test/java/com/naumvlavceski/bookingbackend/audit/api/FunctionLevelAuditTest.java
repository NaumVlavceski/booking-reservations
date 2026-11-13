package com.naumvlavceski.bookingbackend.audit.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * Phase 4 function-level authorization: verbs that are not mapped (PATCH, PUT/DELETE/POST where only another verb
 * exists, TRACE), HEAD and OPTIONS, actuator endpoints, API docs, /api/health and /error.
 */
class FunctionLevelAuditTest extends ApiAuditBase {

    /** Every path template with the verbs it really has. */
    private static Map<String, Set<String>> routes() {
        String id = UUID.randomUUID().toString();
        Map<String, Set<String>> m = new LinkedHashMap<>();
        m.put("/api/auth/register", Set.of("POST"));
        m.put("/api/auth/login", Set.of("POST"));
        m.put("/api/auth/demo", Set.of("POST"));
        m.put("/api/auth/verify-email", Set.of("POST"));
        m.put("/api/auth/resend-code", Set.of("POST"));
        m.put("/api/auth/forgot-password", Set.of("POST"));
        m.put("/api/auth/verify-reset-code", Set.of("POST"));
        m.put("/api/auth/reset-password", Set.of("POST"));
        m.put("/api/me", Set.of("GET"));
        m.put("/api/me/password", Set.of("POST"));
        m.put("/api/me/export", Set.of("GET"));
        m.put("/api/me/support", Set.of("POST"));
        m.put("/api/me/delete", Set.of("POST"));
        m.put("/api/notifications/settings", Set.of("GET", "PUT"));
        m.put("/api/notifications/test", Set.of("POST"));
        m.put("/api/notifications/unsubscribe", Set.of("GET", "POST"));
        m.put("/api/contact", Set.of("POST"));
        m.put("/api/properties", Set.of("GET", "POST"));
        m.put("/api/properties/" + id, Set.of("GET", "PUT", "DELETE"));
        m.put("/api/units", Set.of("GET"));
        m.put("/api/properties/" + id + "/units", Set.of("GET", "POST"));
        m.put("/api/units/" + id, Set.of("GET", "PUT", "DELETE"));
        m.put("/api/reservations", Set.of("GET", "POST"));
        m.put("/api/reservations/cancelled", Set.of("GET")); // also matches /{id} PUT/DELETE: "cancelled" is not a UUID -> 400
        m.put("/api/reservations/" + id, Set.of("GET", "PUT", "DELETE"));
        m.put("/api/reservations/" + id + "/available-options", Set.of("GET"));
        m.put("/api/reservations/" + id + "/move", Set.of("POST"));
        m.put("/api/reservations/" + id + "/copy", Set.of("POST"));
        m.put("/api/reservations/" + id + "/unit", Set.of("GET"));
        m.put("/api/units/" + id + "/calendars", Set.of("GET", "POST"));
        m.put("/api/calendars/" + id, Set.of("DELETE"));
        m.put("/api/calendars/" + id + "/sync", Set.of("POST"));
        m.put("/api/calendars/health", Set.of("GET")); // also matches /calendars/{id} DELETE -> 400 (not a UUID)
        m.put("/api/calendars/sync-all", Set.of("POST"));
        m.put("/api/conflicts", Set.of("GET"));
        m.put("/api/conflicts/" + id + "/dismiss", Set.of("POST"));
        m.put("/api/invoices/properties", Set.of("GET"));
        m.put("/api/invoices/properties/" + id + "/units", Set.of("GET"));
        m.put("/api/invoices/units/" + id + "/reservations", Set.of("GET"));
        m.put("/api/invoices/properties/" + id + "/missing-amounts", Set.of("GET"));
        m.put("/api/invoices/properties/" + id + "/export", Set.of("GET"));
        m.put("/api/ical/" + "0".repeat(64) + ".ics", Set.of("GET"));
        return m;
    }

    @Test
    void verbsThatAreNotMappedAre405ForSignedInCallersAnd401ForAnonymousOnes() throws Exception {
        TestOwner o = newOwner();
        int checked = 0;
        for (var route : routes().entrySet()) {
            for (String verb : List.of("GET", "POST", "PUT", "DELETE", "PATCH")) {
                if (route.getValue().contains(verb)) continue;
                var signedIn = mvc.perform(request(HttpMethod.valueOf(verb), route.getKey())
                        .header("Authorization", "Bearer " + o.token()).with(r -> { r.setRemoteAddr(randomIp()); return r; })
                        .contentType("application/json").content("{}")).andReturn().getResponse();
                int s = signedIn.getStatus();
                // 405 normally; 400 where the path also matches a /{id} route and the segment is not a UUID
                assertTrue(s == 405 || s == 400, verb + " " + route.getKey() + " -> " + s + " " + signedIn.getContentAsString());
                assertErrorShape(signedIn.getContentAsString(), s);
                checked++;
            }
        }
        System.out.println("AUDIT-OBS unmapped verb/path pairs checked: " + checked);
        assertTrue(checked > 150);
        // anonymous PATCH on a signed-in route is stopped before MVC
        assertEquals(401, mvc.perform(request(HttpMethod.PATCH, "/api/properties")).andReturn().getResponse().getStatus());
    }

    @Test
    void traceIsRefusedAndHeadOrOptionsDoNotBypassAuthentication() throws Exception {
        TestOwner o = newOwner();
        HttpResponse<String> trace = live("TRACE", "/api/me", o.token(), null, null);
        System.out.println("AUDIT-OBS live TRACE /api/me -> " + trace.statusCode() + " " + trace.body());
        // StrictHttpFirewall rejects TRACE before MVC; the rejection's error dispatch then ends as 401 (see API-04)
        assertTrue(trace.statusCode() == 405 || trace.statusCode() == 400 || trace.statusCode() == 401, "TRACE -> " + trace.statusCode());
        assertFalse(trace.body().contains(o.token()), "TRACE echoes the Authorization header");

        for (String path : List.of("/api/me", "/api/me/export", "/api/properties", "/api/invoices/properties")) {
            assertEquals(401, live("HEAD", path, null, null, null).statusCode(), "anonymous HEAD " + path);
            HttpResponse<String> opt = live("OPTIONS", path, null, null, null);
            System.out.println("AUDIT-OBS live anonymous OPTIONS " + path + " -> " + opt.statusCode() + " Allow=" + opt.headers().firstValue("Allow").orElse("-"));
            assertTrue(opt.statusCode() == 401 || opt.statusCode() == 200 || opt.statusCode() == 403, "OPTIONS " + path);
            assertTrue(opt.body().isEmpty() || !opt.body().contains("\"email\""), "OPTIONS returned data");
        }
        HttpResponse<String> head = live("HEAD", "/api/me", o.token(), null, null);
        assertEquals(200, head.statusCode());
        assertTrue(head.body().isEmpty());
        // CORS preflight from an unlisted origin gets no allow-origin header
        HttpResponse<String> pre = http.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:" + port + "/api/properties"))
                .method("OPTIONS", java.net.http.HttpRequest.BodyPublishers.noBody())
                .header("Origin", "https://evil.example").header("Access-Control-Request-Method", "GET").build(),
                HttpResponse.BodyHandlers.ofString());
        assertTrue(pre.headers().firstValue("Access-Control-Allow-Origin").isEmpty(), "CORS allows an unlisted origin");
        assertEquals(403, pre.statusCode());
    }

    @Test
    void actuatorAndApiDocsExposeNothingButHealth() throws Exception {
        TestOwner o = newOwner();
        List<String> hidden = List.of("/actuator", "/actuator/env", "/actuator/beans", "/actuator/heapdump", "/actuator/mappings",
                "/actuator/metrics", "/actuator/info", "/actuator/configprops", "/actuator/loggers", "/actuator/threaddump",
                "/actuator/prometheus", "/actuator/caches", "/actuator/scheduledtasks", "/actuator/health/db",
                "/actuator/health/liveness", "/v3/api-docs", "/v3/api-docs.yaml", "/swagger-ui.html", "/swagger-ui/index.html");
        for (String path : hidden) {
            HttpResponse<String> anon = live("GET", path, null, null, null);
            HttpResponse<String> signed = live("GET", path, o.token(), null, null);
            System.out.println("AUDIT-OBS live " + path + " anonymous -> " + anon.statusCode() + ", signed in -> " + signed.statusCode()
                    + " " + signed.body().substring(0, Math.min(160, signed.body().length())));
            assertEquals(401, anon.statusCode(), "anonymous " + path);
            assertTrue(signed.statusCode() == 404 || path.equals("/actuator") && signed.statusCode() == 200
                            || path.startsWith("/actuator/health/") && signed.statusCode() == 200,
                    "signed-in " + path + " -> " + signed.statusCode());
            assertFalse(signed.body().contains("env") && path.equals("/actuator"), "actuator lists more than health: " + signed.body());
            assertFalse(signed.body().contains("openapi"), path + " serves the API spec");
        }
        HttpResponse<String> shutdown = live("POST", "/actuator/shutdown", o.token(), null, null);
        assertTrue(shutdown.statusCode() == 404 || shutdown.statusCode() == 405, "shutdown -> " + shutdown.statusCode());
        HttpResponse<String> health = live("GET", "/actuator/health", null, null, null);
        assertEquals(200, health.statusCode());
        assertFalse(health.body().contains("components"), health.body());
        // /api/health is permitted but has no handler (S18): a plain 404 for everyone
        assertEquals(404, live("GET", "/api/health", null, null, null).statusCode());
    }
}
