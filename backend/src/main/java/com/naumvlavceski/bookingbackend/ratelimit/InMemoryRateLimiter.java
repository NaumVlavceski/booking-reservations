package com.naumvlavceski.bookingbackend.ratelimit;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Sliding-window limiter kept in this JVM's memory: fine for a single backend instance. */
@Component
public class InMemoryRateLimiter implements RateLimiter {
    private static final Duration LONGEST_WINDOW = Duration.ofHours(1);

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    @Override
    public boolean tryAcquire(String key, int max, Duration window) {
        long now = System.currentTimeMillis();
        long cutoff = now - window.toMillis();
        Deque<Long> deque = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && deque.peekFirst() <= cutoff) deque.pollFirst();
            if (deque.size() >= max) return false;
            deque.addLast(now);
            return true;
        }
    }

    @Scheduled(fixedDelay = 600_000)
    void purgeIdleKeys() {
        long cutoff = System.currentTimeMillis() - LONGEST_WINDOW.toMillis();
        hits.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                Long newest = e.getValue().peekLast();
                return newest == null || newest <= cutoff;
            }
        });
    }
}
