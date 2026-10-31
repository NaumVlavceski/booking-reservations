package com.naumvlavceski.bookingbackend.ratelimit;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** Every limit from {@code app.rate-limit} in application.yml (defaults live there). */
@ConfigurationProperties("app.rate-limit")
public record RateLimitProperties(
        int maxKeys,
        Limit authPerIp,
        Limit loginFailuresPerAccount,
        Limit loginFailuresPerIp,
        Limit registerPerIp,
        Limit registerPerEmail,
        Limit resendPerIp,
        Limit resendPerEmail,
        Limit forgotPerIp,
        Limit changePassword,
        Limit accountDeletion,
        Limit dataExport,
        Limit feedPerToken,
        Limit feedMissesPerIp,
        Limit unsubscribePerIp
) {
    /** At most {@code max} calls per {@code window} (1 ms to 1 hour). */
    public record Limit(int max, Duration window) {
        public Limit {
            if (max < 1) throw new IllegalStateException("A rate limit needs max >= 1");
            if (window == null || window.isNegative() || window.isZero()
                    || window.compareTo(InMemoryRateLimiter.LONGEST_WINDOW) > 0) {
                throw new IllegalStateException("A rate-limit window must be between 1 ms and 1 hour");
            }
        }
    }
}
