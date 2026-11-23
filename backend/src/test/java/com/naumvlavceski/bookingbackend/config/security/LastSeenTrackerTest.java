package com.naumvlavceski.bookingbackend.config.security;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A1: last_seen_at is written at most once per 10 minutes per user, and never breaks a request. */
class LastSeenTrackerTest {

    /** A clock the test moves by hand. */
    static final class MutableClock extends Clock {
        Instant now;
        MutableClock(Instant start) { now = start; }
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @Test
    void writesOncePerTenMinutesPerUser() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        MutableClock clock = new MutableClock(Instant.parse("2026-11-22T10:00:00Z"));
        LastSeenTracker tracker = new LastSeenTracker(jdbc, clock);
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();

        tracker.touch(a);
        clock.advance(Duration.ofMinutes(9));
        tracker.touch(a);                       // throttled in memory
        tracker.touch(b);                       // another user is independent
        verify(jdbc, times(2)).update(anyString(), any(), any(), any());

        clock.advance(Duration.ofMinutes(1).plusSeconds(1));
        tracker.touch(a);                       // past 10 minutes: written again
        verify(jdbc, times(3)).update(anyString(), any(), any(), any());
    }

    @Test
    void theUpdateItselfOnlyMovesAnOlderValueForward() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        new LastSeenTracker(jdbc, new MutableClock(Instant.parse("2026-11-22T10:00:00Z"))).touch(UUID.randomUUID());
        verify(jdbc).update(org.mockito.ArgumentMatchers.contains(
                "(last_seen_at IS NULL OR last_seen_at < ?)"), any(), any(), any());
    }

    @Test
    void aDatabaseErrorIsSwallowed() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString(), any(), any(), any())).thenThrow(new DataAccessResourceFailureException("down"));
        LastSeenTracker tracker = new LastSeenTracker(jdbc, Clock.systemUTC());
        assertDoesNotThrow(() -> tracker.touch(UUID.randomUUID()));
        assertDoesNotThrow(() -> tracker.touch(null));
    }
}
