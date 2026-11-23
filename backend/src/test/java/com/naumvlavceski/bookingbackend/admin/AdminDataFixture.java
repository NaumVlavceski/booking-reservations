package com.naumvlavceski.bookingbackend.admin;

import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

/** Writes owners and their data straight into the tables, with chosen timestamps, for the admin query tests. */
final class AdminDataFixture {
    private final JdbcTemplate jdbc;

    AdminDataFixture(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    record Owner(UUID userId, UUID ownerId, String email) {}

    static LocalDateTime local(Instant i) {
        return LocalDateTime.ofInstant(i, ZoneId.systemDefault());
    }

    static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    Owner owner(String name, String phone, Instant created, Instant verified, Instant lastSeen) {
        UUID ownerId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String email = "fx_" + userId.toString().substring(0, 12) + "@example.test";
        jdbc.update("INSERT INTO owner (id, contact_phone, active, created_at) VALUES (?, ?, TRUE, ?)",
                ownerId, phone, local(created));
        jdbc.update("INSERT INTO app_user (id, owner_id, email, password_hash, full_name, role, active, created_at, "
                        + "email_verified_at, last_seen_at) VALUES (?, ?, ?, 'not-a-real-hash', ?, 'OWNER', TRUE, ?, ?, ?)",
                userId, ownerId, email, name, local(created), utc(verified), utc(lastSeen));
        return new Owner(userId, ownerId, email);
    }

    UUID property(Owner o) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO property (id, owner_id, name, address) VALUES (?, ?, 'House', '1 Lake St')", id, o.ownerId());
        return id;
    }

    UUID unit(Owner o, UUID propertyId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO unit (id, property_id, owner_id, name, capacity) VALUES (?, ?, ?, ?, 2)",
                id, propertyId, o.ownerId(), name);
        return id;
    }

    UUID calendar(UUID unitId, String url, int failures, Instant lastSuccess, Instant created) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO external_calendar (id, unit_id, platform, ics_url, consecutive_failures, last_success_at, "
                        + "last_synced_at, created_at, last_error_message) VALUES (?, ?, 'BOOKING', ?, ?, ?, ?, ?, ?)",
                id, unitId, url, failures, utc(lastSuccess), utc(lastSuccess), local(created),
                failures > 0 ? "Feed returned HTTP 403" : null);
        return id;
    }

    UUID reservation(Owner o, UUID unitId, LocalDate in, LocalDate out, Instant created) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO reservation (id, unit_id, owner_id, stay_range, status, source, guest_name, guest_email, "
                        + "guest_phone, notes, total_amount, created_at, updated_at) "
                        + "VALUES (?, ?, ?, daterange(?, ?), 'CONFIRMED', 'DIRECT', 'Guest Person', 'guest@example.test', "
                        + "'+389 70 111 222', 'private note', 100, ?, ?)",
                id, unitId, o.ownerId(), in, out, local(created), local(created));
        return id;
    }

    void conflict(Owner o, UUID unitId, UUID calendarId) {
        jdbc.update("INSERT INTO sync_conflict (id, owner_id, unit_id, external_calendar_id, external_uid, platform, "
                        + "incoming_start, incoming_end, kind, status, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, 'BOOKING', ?, ?, 'NEW_OVERLAP', 'OPEN', now())",
                UUID.randomUUID(), o.ownerId(), unitId, calendarId, "uid-" + UUID.randomUUID(),
                LocalDate.of(2099, 7, 1), LocalDate.of(2099, 7, 3));
    }

    void email(Owner o, String status, Instant created) {
        jdbc.update("INSERT INTO email_log (owner_id, to_address, type, subject, status, attempts, created_at) "
                + "VALUES (?, ?, 'TEST', 'Subject', ?, 1, ?)", o.ownerId(), o.email(), status, utc(created));
    }
}
