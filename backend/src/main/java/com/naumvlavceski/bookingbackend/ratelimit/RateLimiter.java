package com.naumvlavceski.bookingbackend.ratelimit;

import java.time.Duration;

/** Allows at most {@code max} calls per key within the window. Swap the implementation to share limits across servers. */
public interface RateLimiter {
    /** Counts one call and says whether it is allowed (fewer than {@code max} counted in the window before it). */
    boolean tryAcquire(String key, int max, Duration window);

    /** Counts one call without checking anything (a failed login, say). */
    void record(String key, Duration window);

    /** Seconds until one more call would be allowed; 0 when it is allowed now. Counts nothing. */
    long retryAfterSeconds(String key, int max, Duration window);
}
