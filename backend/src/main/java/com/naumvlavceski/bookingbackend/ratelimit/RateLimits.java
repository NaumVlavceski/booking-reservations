package com.naumvlavceski.bookingbackend.ratelimit;

import com.naumvlavceski.bookingbackend.exception.TooManyRequestsException;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimitProperties.Limit;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * The app's limits applied: every refusal is a {@link TooManyRequestsException} (429 with Retry-After).
 * Keys hold IPs and typed email addresses in memory only; they are never logged.
 */
@Component
@RequiredArgsConstructor
@EnableConfigurationProperties(RateLimitProperties.class)
public class RateLimits {
    private final RateLimiter limiter;
    private final RateLimitProperties limits;

    public RateLimitProperties limits() {
        return limits;
    }

    /** Counts this call and refuses it once the limit is reached. */
    public void enforce(String key, Limit limit) {
        if (!limiter.tryAcquire(key, limit.max(), limit.window())) {
            throw new TooManyRequestsException(limiter.retryAfterSeconds(key, limit.max(), limit.window()));
        }
    }

    /** Counts this call; 0 if it is allowed, else the seconds to wait (for answers that are not JSON). */
    public long acquire(String key, Limit limit) {
        if (limiter.tryAcquire(key, limit.max(), limit.window())) return 0;
        return Math.max(1, limiter.retryAfterSeconds(key, limit.max(), limit.window()));
    }

    /** Refuses if the limit is already reached, without counting (failures are counted with {@link #record}). */
    public void requireBelow(String key, Limit limit) {
        long wait = limiter.retryAfterSeconds(key, limit.max(), limit.window());
        if (wait > 0) throw new TooManyRequestsException(wait);
    }

    public void record(String key, Limit limit) {
        limiter.record(key, limit.window());
    }

    /**
     * The client's address. Tomcat (server.forward-headers-strategy: native) only takes it from X-Forwarded-For when
     * the connection comes from an internal proxy address (Caddy on the Docker network), so a client cannot pick it.
     */
    public static String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr();
    }

    /** One key per address however it was typed. */
    public static String email(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }
}
