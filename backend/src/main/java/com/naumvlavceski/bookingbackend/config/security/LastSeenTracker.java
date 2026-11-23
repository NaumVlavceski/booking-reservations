package com.naumvlavceski.bookingbackend.config.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Remembers when an owner last used the app ({@code app_user.last_seen_at}), for the admin panel's activity numbers.
 * Written at most once per {@link #THROTTLE} per user: a cheap in-memory check first, then a conditional UPDATE so
 * several app instances (or a restart) still write rarely. Never fails or slows the request: errors are logged at
 * debug level and ignored.
 */
@Slf4j
@Component
public class LastSeenTracker {
    static final Duration THROTTLE = Duration.ofMinutes(10);
    /** The map only saves database round trips; past this size it simply starts over. */
    private static final int MAX_ENTRIES = 50_000;

    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final Map<UUID, Instant> lastWritten = new ConcurrentHashMap<>();

    public LastSeenTracker(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    public void touch(UUID userId) {
        if (userId == null) return;
        try {
            Instant now = clock.instant();
            Instant previous = lastWritten.get(userId);
            if (previous != null && previous.isAfter(now.minus(THROTTLE))) return;
            if (lastWritten.size() >= MAX_ENTRIES) lastWritten.clear();
            lastWritten.put(userId, now);
            jdbc.update("UPDATE app_user SET last_seen_at = ? WHERE id = ? "
                            + "AND (last_seen_at IS NULL OR last_seen_at < ?)",
                    utc(now), userId, utc(now.minus(THROTTLE)));
        } catch (Exception e) {
            log.debug("Could not record last_seen_at: {}", e.toString());
        }
    }
}
