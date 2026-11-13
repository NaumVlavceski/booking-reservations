package com.naumvlavceski.bookingbackend.audit.platform;

import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The server is started the way docker-compose.yml starts it: APP_CORS_ALLOWED_ORIGINS holds the frontend URL.
 * An origin that is not in that list must be refused.
 */
// Finding SEC-03, FIXED (SecurityConfig reads app.cors.allowed-origins = APP_CORS_ALLOWED_ORIGINS): regression test.
// Before, the origins were hard-coded, including the old https://resbooking.netlify.app and every deploy preview.
@SpringBootTest(properties = "APP_CORS_ALLOWED_ORIGINS=https://roomtrack.app,https://www.roomtrack.app")
class CorsConfiguredOriginsAuditTest extends AuditTestBase {

    @org.junit.jupiter.params.ParameterizedTest
    @ValueSource(strings = {"https://roomtrack.app", "https://www.roomtrack.app"})
    void theConfiguredOriginsAreAllowed(String origin) throws Exception {
        mvc.perform(options("/api/properties")
                        .header("Origin", origin)
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", origin));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://resbooking.netlify.app", "https://deploy-preview-1--resbooking.netlify.app",
            "http://localhost:5173"})
    void originsOutsideTheConfiguredListAreRefused(String origin) throws Exception {
        mvc.perform(options("/api/properties")
                        .header("Origin", origin)
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
