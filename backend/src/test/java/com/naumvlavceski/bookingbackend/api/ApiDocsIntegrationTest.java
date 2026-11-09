package com.naumvlavceski.bookingbackend.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The API documentation as it is served with app.docs.enabled=true (it is off by default, see ApiIntegrationTest). */
@SpringBootTest(properties = {
        "app.docs.enabled=true",
        "app.docs.server-url=https://api.example.test",
        "app.rate-limit.docs-per-ip.max=5"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiDocsIntegrationTest {

    @Autowired MockMvc mvc;

    private String spec(String clientIp) throws Exception {
        return mvc.perform(get("/v3/api-docs").with(r -> { r.setRemoteAddr(clientIp); return r; }))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void specIsPublicAndDescribesTheApi() throws Exception {
        String spec = spec("203.0.113.1");
        assertEquals("RoomTrack API", JsonPath.read(spec, "$.info.title"));
        assertEquals("https://api.example.test", JsonPath.read(spec, "$.servers[0].url"));
        assertEquals("bearer", JsonPath.read(spec, "$.components.securitySchemes.bearerAuth.scheme"));
        List<String> tags = JsonPath.read(spec, "$.tags[*].name");
        assertEquals(List.of("Auth", "Properties", "Units", "Reservations", "Calendar sync", "Earnings",
                "Account and privacy", "Contact"), tags);
        assertTrue(spec.contains("#/components/responses/DatesTaken"), "the 409 overlap answer is referenced");
    }

    @Test
    void tokenEndpointsAndTheOwnerIdStayOutOfTheSpec() throws Exception {
        String spec = spec("203.0.113.2");
        Map<String, Object> paths = JsonPath.read(spec, "$.paths");
        assertFalse(paths.keySet().stream().anyMatch(p -> p.startsWith("/api/ical")), "feed export is hidden");
        assertFalse(paths.containsKey("/api/notifications/unsubscribe"), "unsubscribe pages are hidden");
        assertFalse(paths.keySet().stream().anyMatch(p -> p.startsWith("/actuator")), "actuator is hidden");
        assertFalse(spec.contains("\"name\":\"ownerId\""), "the owner id comes from the token, not a parameter");
    }

    @Test
    void onlyNonAuthOperationsNeedTheToken() throws Exception {
        String spec = spec("203.0.113.3");
        List<Object> loginSecurity = JsonPath.read(spec, "$.paths['/api/auth/login'].post[?(@.security)]");
        assertTrue(loginSecurity.isEmpty(), "sign-in needs no token");
        List<Object> contactSecurity = JsonPath.read(spec, "$.paths['/api/contact'].post[?(@.security)]");
        assertTrue(contactSecurity.isEmpty(), "the contact form needs no token");
        List<String> reservationSecurity = JsonPath.read(spec, "$.paths['/api/reservations'].post.security[0].bearerAuth");
        assertTrue(reservationSecurity.isEmpty(), "bearer, no scopes");
        assertEquals("#/components/responses/Unauthorized",
                JsonPath.read(spec, "$.paths['/api/reservations'].post.responses['401'].$ref"));
    }

    @Test
    void swaggerUiIsServed() throws Exception {
        mvc.perform(get("/swagger-ui/index.html").with(r -> { r.setRemoteAddr("203.0.113.4"); return r; }))
                .andExpect(status().isOk());
    }

    @Test
    void docsAreRateLimitedPerIp() throws Exception {
        for (int i = 0; i < 5; i++) spec("203.0.113.50");
        mvc.perform(get("/v3/api-docs").with(r -> { r.setRemoteAddr("203.0.113.50"); return r; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(jsonPath("$.message").value(containsString("Too many attempts")));
        spec("203.0.113.51"); // another client is not affected
    }
}
