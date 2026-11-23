package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** B1: APP_ADMIN_ENABLED=false hides everything, even from the admin; and the startup rule for true. */
@TestPropertySource(properties = "app.admin.enabled=false")
class AdminDisabledTest extends AuditTestBase {
    @Autowired JdbcTemplate jdbc;

    @Test
    void whenOffEveryAdminRouteIs404AndMeSaysNotAdmin() throws Exception {
        TestOwner admin = newOwner();
        jdbc.update("UPDATE app_user SET is_admin = TRUE WHERE lower(email) = lower(?)", admin.email());
        send(post("/api/admin/auth/request-code"), admin.token(), null).andExpect(status().isNotFound());
        send(get("/api/admin/overview"), admin.token(), null).andExpect(status().isNotFound());
        assertFalse(body(send(get("/api/me"), admin.token(), null)).contains("\"isAdmin\":true"));
    }

    @Test
    void enabledRefusesToStartWithoutEmail() {
        assertThrows(IllegalStateException.class, () -> AdminStartupCheck.check(true, false, false, "key"));
        assertThrows(IllegalStateException.class, () -> AdminStartupCheck.check(true, false, true, " "));
        AdminStartupCheck.check(true, false, true, "re_test_key");   // fine
        AdminStartupCheck.check(false, false, false, null);          // off: nothing needed
        AdminStartupCheck.check(true, true, false, null);            // test profile exempt
    }
}
