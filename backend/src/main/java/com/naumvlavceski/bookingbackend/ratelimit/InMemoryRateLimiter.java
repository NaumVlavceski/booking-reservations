package com.naumvlavceski.bookingbackend.ratelimit;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window limiter kept in this JVM's memory: fine for a single backend instance, and it starts empty after a
 * restart (the emailed-code limits are also kept in the database, so those survive). Memory stays bounded: keys
 * expire with the longest window, and at most {@code app.rate-limit.max-keys} are kept. When that many are live,
 * new keys are refused (the caller answers 429) rather than letting a flood push out the counters that matter.
 */
@Slf4j
@Component
public class InMemoryRateLimiter implements RateLimiter {
    static final Duration LONGEST_WINDOW = Duration.ofHours(1);
    private static final long FULL_RETRY_SECONDS = 60;

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();
    private final int maxKeys;
    private final Clock clock;
    private volatile long lastFullWarning;

    InMemoryRateLimiter(@Value("${app.rate-limit.max-keys:50000}") int maxKeys, Clock clock) {
        if (maxKeys < 1) throw new IllegalStateException("app.rate-limit.max-keys must be at least 1");
        this.maxKeys = maxKeys;
        this.clock = clock;
    }

    @Override
    public boolean tryAcquire(String key, int max, Duration window) {
        checkWindow(window);
        long now = clock.millis();
        Deque<Long> deque = slot(key, now);
        if (deque == null) return false;
        synchronized (deque) {
            prune(deque, now - window.toMillis());
            if (deque.size() >= max) return false;
            deque.addLast(now);
            return true;
        }
    }

    @Override
    public void record(String key, Duration window) {
        checkWindow(window);
        long now = clock.millis();
        Deque<Long> deque = slot(key, now);
        if (deque == null) return;
        synchronized (deque) {
            prune(deque, now - window.toMillis());
            deque.addLast(now);
        }
    }

    @Override
    public long retryAfterSeconds(String key, int max, Duration window) {
        checkWindow(window);
        long now = clock.millis();
        Deque<Long> deque = hits.get(key);
        if (deque == null) return hits.size() >= maxKeys ? FULL_RETRY_SECONDS : 0;
        synchronized (deque) {
            prune(deque, now - window.toMillis());
            if (deque.size() < max) return 0;
            // The call that frees a place is the one `max` back from the newest
            Iterator<Long> it = deque.descendingIterator();
            long freeing = 0;
            for (int i = 0; i < max && it.hasNext(); i++) freeing = it.next();
            return Math.max(1, (freeing + window.toMillis() - now + 999) / 1000);
        }
    }

    @Scheduled(fixedDelay = 600_000)
    void purgeIdleKeys() {
        long cutoff = clock.millis() - LONGEST_WINDOW.toMillis();
        hits.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                Long newest = e.getValue().peekLast();
                return newest == null || newest <= cutoff;
            }
        });
    }

    int size() {
        return hits.size();
    }

    private Deque<Long> slot(String key, long now) {
        Deque<Long> existing = hits.get(key);
        if (existing != null) return existing;
        if (hits.size() >= maxKeys) {
            purgeIdleKeys();
            if (hits.size() >= maxKeys) {
                if (now - lastFullWarning > 60_000) {
                    lastFullWarning = now;
                    log.warn("Rate limiter is full ({} keys): refusing new keys until old ones expire", maxKeys);
                }
                return null;
            }
        }
        return hits.computeIfAbsent(key, k -> new ArrayDeque<>());
    }

    private static void prune(Deque<Long> deque, long cutoff) {
        while (!deque.isEmpty() && deque.peekFirst() <= cutoff) deque.pollFirst();
    }

    private static void checkWindow(Duration window) {
        if (window.isNegative() || window.isZero() || window.compareTo(LONGEST_WINDOW) > 0) {
            throw new IllegalStateException("Rate-limit windows must be between 1 ms and " + LONGEST_WINDOW);
        }
    }
}
