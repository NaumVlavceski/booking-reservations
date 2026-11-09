package com.naumvlavceski.bookingbackend.ratelimit;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

class InMemoryRateLimiterTest {

    static class TestClock extends Clock {
        Instant now = Instant.parse("2030-01-01T00:00:00Z");
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private final TestClock clock = new TestClock();
    private static final Duration WINDOW = Duration.ofMinutes(15);

    @Test
    void allowsUpToMaxThenSaysHowLongToWait() {
        var limiter = new InMemoryRateLimiter(100, clock);
        for (int i = 0; i < 3; i++) {
            assertTrue(limiter.tryAcquire("k", 3, WINDOW));
            clock.advance(Duration.ofMinutes(1));
        }
        assertFalse(limiter.tryAcquire("k", 3, WINDOW));
        // The oldest of the three was 3 minutes ago, so a place frees up in 12 minutes
        assertEquals(12 * 60, limiter.retryAfterSeconds("k", 3, WINDOW));
        clock.advance(Duration.ofMinutes(12));
        assertEquals(0, limiter.retryAfterSeconds("k", 3, WINDOW));
        assertTrue(limiter.tryAcquire("k", 3, WINDOW));
    }

    @Test
    void recordCountsWithoutCheckingAndRetryAfterCountsNothing() {
        var limiter = new InMemoryRateLimiter(100, clock);
        for (int i = 0; i < 5; i++) limiter.record("fail", WINDOW);
        assertTrue(limiter.retryAfterSeconds("fail", 5, WINDOW) > 0);
        assertTrue(limiter.retryAfterSeconds("fail", 6, WINDOW) == 0);
        assertTrue(limiter.retryAfterSeconds("fail", 6, WINDOW) == 0, "asking twice does not count");
    }

    @Test
    void memoryIsBoundedAndOldKeysExpire() {
        var limiter = new InMemoryRateLimiter(3, clock);
        assertTrue(limiter.tryAcquire("a", 10, WINDOW));
        assertTrue(limiter.tryAcquire("b", 10, WINDOW));
        assertTrue(limiter.tryAcquire("c", 10, WINDOW));
        // Full: a new key is refused, existing keys keep working
        assertFalse(limiter.tryAcquire("d", 10, WINDOW));
        assertTrue(limiter.retryAfterSeconds("d", 10, WINDOW) > 0);
        assertTrue(limiter.tryAcquire("a", 10, WINDOW));
        assertEquals(3, limiter.size());

        clock.advance(Duration.ofHours(1).plusSeconds(1));
        assertTrue(limiter.tryAcquire("d", 10, WINDOW), "expired keys are purged to make room");
        assertEquals(1, limiter.size());
    }

    @Test
    void windowsLongerThanAnHourAreAConfigurationError() {
        var limiter = new InMemoryRateLimiter(100, clock);
        assertThrows(IllegalStateException.class, () -> limiter.tryAcquire("k", 1, Duration.ofHours(2)));
        assertThrows(IllegalStateException.class, () -> new RateLimitProperties.Limit(1, Duration.ofDays(1)));
        assertThrows(IllegalStateException.class, () -> new RateLimitProperties.Limit(0, Duration.ofMinutes(1)));
    }
}
