package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A1 end to end: the real filter chain writes last_seen_at for owner requests, not for background polling. */
class LastSeenIntegrationTest extends AuditTestBase {

    @Autowired JdbcTemplate jdbc;

    private Timestamp lastSeen(String email) {
        return jdbc.queryForObject("SELECT last_seen_at FROM app_user WHERE lower(email) = lower(?)",
                Timestamp.class, email);
    }

    @Test
    void ownerRequestsSetLastSeenAndBackgroundPollingDoesNot() throws Exception {
        TestOwner owner = newOwner();
        jdbc.update("UPDATE app_user SET last_seen_at = NULL WHERE lower(email) = lower(?)", owner.email());

        mvc.perform(get("/api/me").header("Authorization", "Bearer " + owner.token()).header("X-Background", "true"))
                .andExpect(status().isOk());
        assertNull(lastSeen(owner.email()), "polling is not activity");

        mvc.perform(get("/api/me").header("Authorization", "Bearer " + owner.token())).andExpect(status().isOk());
        Timestamp first = lastSeen(owner.email());
        assertNotNull(first);

        mvc.perform(get("/api/me").header("Authorization", "Bearer " + owner.token())).andExpect(status().isOk());
        assertEquals(first, lastSeen(owner.email()), "a second request within 10 minutes writes nothing");
    }

    @Test
    void publicEndpointsDoNotCount() throws Exception {
        TestOwner owner = newOwner();
        jdbc.update("UPDATE app_user SET last_seen_at = NULL WHERE lower(email) = lower(?)", owner.email());
        mvc.perform(get("/api/health")).andReturn();
        assertNull(lastSeen(owner.email()));
    }
}
