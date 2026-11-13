package com.naumvlavceski.bookingbackend.audit.platform;

import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Platform audit (Docs/testing/report/platform.md): CORS policy and security response headers of the API.
 * Real filter chain through MockMvc; no network.
 */
class CorsAndHeadersAuditTest extends AuditTestBase {

    private ResultActions preflight(String origin) throws Exception {
        return mvc.perform(options("/api/properties")
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "authorization"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://roomtrack.app", "https://www.roomtrack.app"})
    void theRealFrontendOriginsArePreflightedWithTheirOwnOriginEchoed(String origin) throws Exception {
        preflight(origin)
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", origin))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Expose-Headers", containsString("X-Refreshed-Token")))
                .andExpect(header().string("Vary", containsString("Origin")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://evil.example", "null", "https://roomtrack.app.evil.example",
            "http://roomtrack.app", "https://evilroomtrack.app"})
    void foreignOriginsAreNeitherAllowedNorReflected(String origin) throws Exception {
        preflight(origin)
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        // a plain cross-origin GET from such a page is refused as well (no wildcard, no reflection)
        mvc.perform(get("/actuator/health").header("Origin", origin))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void authenticatedJsonIsNotCacheableAndCarriesTheSpringSecurityDefaults() throws Exception {
        TestOwner owner = newOwner();
        send(get("/api/me"), owner.token(), null)
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().doesNotExist("Server"))
                .andExpect(header().doesNotExist("X-Powered-By"));
    }

    @Test
    void healthShowsStatusOnlyAndOtherActuatorEndpointsAreNotExposed() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .string(not(containsString("components"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .string(not(containsString("details"))));
        TestOwner owner = newOwner();
        for (String path : new String[]{"/actuator/env", "/actuator/beans", "/actuator/configprops",
                "/actuator/heapdump", "/actuator/loggers", "/actuator/metrics", "/actuator/mappings"}) {
            send(get(path), owner.token(), null).andExpect(status().isNotFound());
        }
    }

    // Finding SEC-07, FIXED (SecurityConfig headers): regression test. Before, the API sent no Referrer-Policy and no
    // Content-Security-Policy (frame-ancestors) header, and Caddy added none either.
    @Test
    void apiResponsesCarryReferrerPolicyAndCsp() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Referrer-Policy", not(nullValue())))
                .andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")));
    }

    @Test
    void signedInApiAnswersAreNeverCached() throws Exception {
        TestOwner o = newOwner();
        send(get("/api/properties"), o.token(), null)
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("Referrer-Policy", "no-referrer"));
    }
}
