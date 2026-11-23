package com.naumvlavceski.bookingbackend.admin;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalToIgnoringCase;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin panel calls the API cross-origin (roomtrack.app to api.roomtrack.app): a PATCH with the owner token and
 * the X-Admin-Session header must pass the browser's preflight from the frontend origin only, and the session expiry
 * headers must be readable by the page.
 */
@SpringBootTest(properties = "APP_CORS_ALLOWED_ORIGINS=https://roomtrack.app,https://www.roomtrack.app")
class AdminCorsTest extends AdminTestBase {
    private static final String ALLOWED = "https://roomtrack.app";

    private ResultActions preflight(String origin) throws Exception {
        return mvc.perform(options("/api/admin/notes/" + UUID.randomUUID())
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "PATCH")
                .header("Access-Control-Request-Headers", "x-admin-session,authorization"));
    }

    @Test
    void preflightForAnAdminPatchFromTheFrontendIsAllowed() throws Exception {
        preflight(ALLOWED)
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Allow-Methods", containsString("PATCH")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("x-admin-session")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("authorization")))
                .andExpect(header().string("Access-Control-Allow-Origin", not(equalToIgnoringCase("*"))));
    }

    @Test
    void theOwnerAppHeadersStillPassThePreflight() throws Exception {
        mvc.perform(options("/api/properties")
                        .header("Origin", ALLOWED)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "authorization,x-background"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("x-background")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("authorization")));
    }

    @Test
    void preflightFromAnotherOriginIsRefused() throws Exception {
        for (String origin : new String[]{"https://evil.example", "https://roomtrack.app.evil.example", "null"}) {
            preflight(origin)
                    .andExpect(status().isForbidden())
                    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"))
                    .andExpect(header().doesNotExist("Access-Control-Allow-Headers"));
        }
    }

    @Test
    void anAdminResponseExposesTheSessionHeadersToTheFrontend() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        admin(get("/api/admin/badge").header("Origin", ALLOWED), admin, session, null)
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED))
                .andExpect(header().exists(AdminAccessFilter.EXPIRES_HEADER))
                .andExpect(header().exists(AdminAccessFilter.MAX_HEADER))
                .andExpect(header().string("Access-Control-Expose-Headers", containsString(AdminAccessFilter.EXPIRES_HEADER)))
                .andExpect(header().string("Access-Control-Expose-Headers", containsString(AdminAccessFilter.MAX_HEADER)))
                .andExpect(header().string("Access-Control-Expose-Headers", containsString("X-Refreshed-Token")));
    }
}
