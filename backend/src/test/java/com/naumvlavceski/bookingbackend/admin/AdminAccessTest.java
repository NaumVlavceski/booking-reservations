package com.naumvlavceski.bookingbackend.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * B1/B6: who can reach /api/admin/**. Every registered admin route is found by reflection, so a new route that forgets
 * the gate fails here.
 */
class AdminAccessTest extends AdminTestBase {

    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings;

    record Route(HttpMethod method, String path, boolean stepUp) {}

    /** Every /api/admin route, with path variables filled in with random ids. */
    private List<Route> adminRoutes() {
        List<Route> routes = new ArrayList<>();
        for (RequestMappingInfo info : mappings.getHandlerMethods().keySet()) {
            for (String pattern : info.getPatternValues()) {
                if (!pattern.startsWith("/api/admin")) continue;
                String path = pattern.replaceAll("\\{[^}]+}", UUID.randomUUID().toString());
                Set<org.springframework.web.bind.annotation.RequestMethod> methods = info.getMethodsCondition().getMethods();
                for (var m : methods) {
                    routes.add(new Route(HttpMethod.valueOf(m.name()), path,
                            AdminAccessFilter.STEP_UP_PATHS.contains(pattern)));
                }
            }
        }
        assertTrue(routes.size() >= 15, "found the admin routes: " + routes);
        return routes;
    }

    private MockHttpServletRequestBuilder req(Route r) {
        MockHttpServletRequestBuilder b = request(r.method(), r.path());
        if (r.method() == HttpMethod.POST || r.method() == HttpMethod.PATCH) {
            b.contentType("application/json").content("{\"code\":\"000000\",\"text\":\"x\"}");
        }
        return b;
    }

    private int statusOf(Route r, TestOwner owner, String session) throws Exception {
        MockHttpServletRequestBuilder b = req(r);
        if (owner != null) b.header("Authorization", "Bearer " + owner.token());
        if (session != null) b.header(AdminSessionService.HEADER, session);
        MvcResult res = mvc.perform(b).andReturn();
        String cache = res.getResponse().getHeader("Cache-Control");
        assertTrue(cache != null && cache.contains("no-store"), r + " must not be cached");
        return res.getResponse().getStatus();
    }

    @Test
    void everyAdminRouteIsHiddenFromStrangersAndOwnersAndNeedsAnAdminSession() throws Exception {
        TestOwner owner = newOwner();
        TestOwner admin = newAdmin();
        for (Route r : adminRoutes()) {
            assertEquals(404, statusOf(r, null, null), "anonymous " + r);
            assertEquals(404, statusOf(r, owner, null), "plain owner " + r);
            assertEquals(404, statusOf(r, owner, "made-up-session"), "plain owner with a fake session " + r);
            if (!r.stepUp()) {
                assertEquals(403, statusOf(r, admin, null), "admin without admin session " + r);
                assertEquals(403, statusOf(r, admin, "made-up-session"), "admin with a fake session " + r);
            }
        }
    }

    @Test
    void matrixForTheReadRoutes() throws Exception {
        TestOwner admin = newAdmin();
        TestOwner target = newOwner();
        UUID targetId = userId(target);
        String session = openSession(admin);
        List<String> reads = List.of("/api/admin/overview", "/api/admin/owners", "/api/admin/owners/" + targetId,
                "/api/admin/owners/" + targetId + "/reservations", "/api/admin/owners/" + targetId + "/calendars",
                "/api/admin/owners/" + targetId + "/emails", "/api/admin/owners/" + targetId + "/notes",
                "/api/admin/follow-ups", "/api/admin/audit-log", "/api/admin/system", "/api/admin/badge",
                "/api/admin/auth/session");
        for (String path : reads) {
            admin(get(path), admin, session, null).andExpect(status().isOk())
                    .andExpect(header().exists(AdminAccessFilter.EXPIRES_HEADER));
        }

        // Expired session
        jdbc.update("UPDATE admin_session SET expires_at = now() - interval '1 second' WHERE token_hash = ?",
                AdminSessionService.hash(session));
        for (String path : reads) admin(get(path), admin, session, null).andExpect(status().isForbidden());

        // A fresh session stops working the moment is_admin is unset
        String second = openSessionAfterCooldown(admin);
        admin(get("/api/admin/overview"), admin, second, null).andExpect(status().isOk());
        jdbc.update("UPDATE app_user SET is_admin = FALSE WHERE id = ?", userId(admin));
        for (String path : reads) admin(get(path), admin, second, null).andExpect(status().isNotFound());
    }

    private String openSessionAfterCooldown(TestOwner admin) throws Exception {
        jdbc.update("UPDATE admin_stepup_code SET created_at = created_at - interval '2 minutes' WHERE user_id = ?",
                userId(admin));
        return openSession(admin);
    }

    @Test
    void anAdminSessionIsNotAnOwnerToken() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        // Without the owner token the admin session alone opens nothing, admin or owner
        admin(get("/api/admin/overview"), null, session, null).andExpect(status().isNotFound());
        mvc.perform(get("/api/me").header(AdminSessionService.HEADER, session)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + session)).andExpect(status().isUnauthorized());
    }

    @Test
    void meTellsOnlyTheAdminThatTheyAreAdmin() throws Exception {
        TestOwner owner = newOwner();
        TestOwner admin = newAdmin();
        assertFalse(body(send(get("/api/me"), owner.token(), null)).contains("\"isAdmin\":true"));
        assertTrue(body(send(get("/api/me"), admin.token(), null)).contains("\"isAdmin\":true"));
    }

    @Test
    void unknownAdminPathsAreAlso404() throws Exception {
        TestOwner owner = newOwner();
        admin(post("/api/admin/does-not-exist"), owner, null, null).andExpect(status().isNotFound());
        admin(get("/api/admin"), null, null, null).andExpect(status().isNotFound());
    }
}
