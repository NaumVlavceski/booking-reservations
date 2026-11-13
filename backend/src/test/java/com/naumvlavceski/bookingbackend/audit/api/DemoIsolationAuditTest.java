package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.demo.DemoAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 4 demo mode ("Try the demo" is on by default, by decision): a demo token is an ordinary owner token for a
 * throwaway owner, so it must not reach real owners' data, must not make the server send email or fetch URLs, must
 * stay within its caps, and must stop working when the demo is cleaned up.
 */
class DemoIsolationAuditTest extends ApiAuditBase {

    @Autowired DemoAccounts demoAccounts;

    private String startDemo() throws Exception {
        return JsonPath.read(body(sendFrom(randomIp(), post("/api/auth/demo"), null, null).andExpect(status().isOk())), "$.token");
    }

    @Test
    void aDemoTokenCannotReachARealOwnersData() throws Exception {
        TenantFixture a = ownerWithData();
        String demo = startDemo();
        String demoProperty = JsonPath.read(body(send(get("/api/properties"), demo, null)), "$[0].id");
        String demoUnit = roomIds(demo, demoProperty).getFirst();
        String demoRes = JsonPath.read(body(send(get("/api/reservations?unitId=" + demoUnit), demo, null)), "$[0].id");
        assertEquals(31, assertCannotReachOwnerA(a, demo, demoProperty, demoUnit, demoRes));
        String export = body(send(get("/api/me/export"), demo, null).andExpect(status().isOk()));
        assertFalse(export.contains(a.email()) || export.contains("A-Secret-House"));
        // and two demos do not see each other
        String other = startDemo();
        send(get("/api/properties/" + demoProperty), other, null).andExpect(status().isNotFound());
        send(get("/api/reservations/" + demoRes), other, null).andExpect(status().isNotFound());
    }

    @Test
    void aDemoCannotSendEmailConnectCalendarsOrBecomeALastingAccount() throws Exception {
        String demo = startDemo();
        String email = JsonPath.read(body(send(get("/api/me"), demo, null)), "$.email");
        String unit = JsonPath.read(body(send(get("/api/units"), demo, null)), "$[0].id");
        record Call(String method, String path, String body) {}
        List<Call> restricted = List.of(
                new Call("POST", "/api/units/" + unit + "/calendars", "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=demo\"}"),
                new Call("POST", "/api/me/support", "{\"message\":\"spam\"}"),
                new Call("POST", "/api/notifications/test", null),
                new Call("PUT", "/api/notifications/settings", "{\"enabled\":true}"),
                new Call("POST", "/api/me/password", "{\"currentPassword\":\"whatever-1\",\"newPassword\":\"Mine-forever-1\"}"),
                new Call("POST", "/api/me/delete", "{\"password\":\"whatever-1\",\"confirmation\":\"DELETE\"}"));
        for (Call c : restricted) {
            String r = body(send(request(org.springframework.http.HttpMethod.valueOf(c.method()), c.path()), demo, c.body())
                    .andExpect(status().isForbidden()));
            assertErrorShape(r, 403);
            assertEquals("DEMO_RESTRICTED", JsonPath.read(r, "$.code"), c.path());
        }
        assertEquals(0, (int) jdbc.queryForObject("SELECT count(*) FROM external_calendar WHERE unit_id = ?::uuid", Integer.class, unit));
        // a reset for the demo address sends nothing
        sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + email + "\"}").andExpect(status().isOk());
        verify(emailService, never()).sendNow(any());
        assertEquals(0, emailsTo(email));
        // turning notifications OFF is allowed and harmless
        send(put("/api/notifications/settings"), demo, "{\"enabled\":false}").andExpect(status().isOk());
        // caps: one property with 200 rooms is over the 50-room cap
        send(post("/api/properties"), demo, "{\"name\":\"Big\",\"unitCount\":200}").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"));
        // sync-all has nothing to fetch
        send(post("/api/calendars/sync-all"), demo, null).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void aDemoTokenStopsWorkingWhenTheDemoIsCleanedUp() throws Exception {
        String demo = startDemo();
        String email = JsonPath.read(body(send(get("/api/me"), demo, null)), "$.email");
        UUID owner = ownerIdOf(email);
        // past its lifetime but before the 5-minute cleanup run: still usable (documented window, at most 5 min)
        jdbc.update("UPDATE owner SET created_at = created_at - interval '2 hours' WHERE id = ?", owner);
        send(get("/api/me"), demo, null).andExpect(status().isOk());
        assertTrue(demoAccounts.deleteExpired() >= 1);
        send(get("/api/me"), demo, null).andExpect(status().isUnauthorized());
        send(get("/api/properties"), demo, null).andExpect(status().isUnauthorized());
        assertEquals(0, (int) jdbc.queryForObject("SELECT count(*) FROM property WHERE owner_id = ?", Integer.class, owner));
    }
}
