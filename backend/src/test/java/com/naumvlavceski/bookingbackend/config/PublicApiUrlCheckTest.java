package com.naumvlavceski.bookingbackend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** SEC-04 / BIZ-04: production refuses to start with a PUBLIC_API_URL that would break the links in emails. */
class PublicApiUrlCheckTest {

    @Test
    void productionRefusesEmptyRelativeHttpAndLocalhostAddresses() {
        for (String bad : new String[]{"", "  ", "/api", "api.roomtrack.app", "http://api.roomtrack.app",
                "https://localhost:8080", "https://127.0.0.1", "https://[::1]:8443", "https://app.localhost"}) {
            IllegalStateException e = assertThrows(IllegalStateException.class, () -> PublicApiUrlCheck.check(false, bad), bad);
            assertTrue(e.getMessage().startsWith("PUBLIC_API_URL "), e.getMessage());
        }
    }

    @Test
    void productionAcceptsTheRealHttpsAddress() {
        assertDoesNotThrow(() -> PublicApiUrlCheck.check(false, "https://api.roomtrack.app"));
        assertDoesNotThrow(() -> PublicApiUrlCheck.check(false, "https://api.roomtrack.app/"));
    }

    @Test
    void localAndTestProfilesStayPermissive() {
        assertDoesNotThrow(() -> PublicApiUrlCheck.check(true, "http://localhost:8080"));
        assertDoesNotThrow(() -> PublicApiUrlCheck.check(true, ""));
    }
}
