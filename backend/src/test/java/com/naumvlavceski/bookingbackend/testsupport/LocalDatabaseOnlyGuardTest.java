package com.naumvlavceski.bookingbackend.testsupport;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class LocalDatabaseOnlyGuardTest {

    @Test
    void acceptsTestcontainersAndLocalTestDatabases() {
        assertTrue(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:tc:postgresql:16:///booking_test"));
        assertTrue(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:postgresql://localhost:5432/booking_test"));
        assertTrue(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:postgresql://127.0.0.1:45432/audit_test?sslmode=disable"));
        assertTrue(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:postgresql://host.docker.internal:45432/booking_test"));
    }

    @Test
    void refusesRemoteHostsAndNonTestDatabases() {
        assertFalse(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:postgresql://api.roomtrack.app:5432/booking_test"));
        assertFalse(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:postgresql://10.0.0.5:5432/booking_test"));
        assertFalse(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:postgresql://localhost:5432/booking"));
        assertFalse(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:postgresql://localhost.evil.com:5432/booking_test"));
        assertFalse(LocalDatabaseOnlyGuard.isLocalTestDatabase("jdbc:mysql://localhost/booking_test"));
        assertFalse(LocalDatabaseOnlyGuard.isLocalTestDatabase("not a url"));
    }

    @Test
    void checkThrowsWithoutPrintingTheValue() {
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> LocalDatabaseOnlyGuard.check("TEST_DB_URL", "jdbc:postgresql://prod.example.com/booking?password=s3cret"));
        assertFalse(e.getMessage().contains("s3cret"));
        assertDoesNotThrow(() -> LocalDatabaseOnlyGuard.check("TEST_DB_URL", null));
    }
}
