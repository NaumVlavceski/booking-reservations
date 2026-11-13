package com.naumvlavceski.bookingbackend.audit.platform;

import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.userdetails.UserDetailsService;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * SEC-10 (fixed in application.yml): Spring Boot's default in-memory user, whose generated password was printed in
 * every startup log, is not created. Sign-in is RoomTrack's own (AuthService + JWT).
 */
class NoDefaultUserAuditTest extends AuditTestBase {

    @Autowired ApplicationContext context;

    @Test
    void noGeneratedDefaultUserExists() {
        assertEquals(0, context.getBeanNamesForType(UserDetailsService.class).length,
                "Spring Boot's default user (and its logged password) is back");
    }
}
