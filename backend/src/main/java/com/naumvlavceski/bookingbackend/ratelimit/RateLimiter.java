package com.naumvlavceski.bookingbackend.ratelimit;

import java.time.Duration;

/** Allows at most {@code max} calls per key within the window. Swap the implementation to share limits across servers. */
public interface RateLimiter {
    boolean tryAcquire(String key, int max, Duration window);
}
