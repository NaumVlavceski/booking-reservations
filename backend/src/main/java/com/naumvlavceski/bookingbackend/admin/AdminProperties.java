package com.naumvlavceski.bookingbackend.admin;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * {@code app.admin} in application.yml. {@code enabled} (APP_ADMIN_ENABLED, default false) switches the whole panel:
 * when false every /api/admin/** route is 404 and {@code /api/me} never reports isAdmin.
 */
@ConfigurationProperties("app.admin")
public record AdminProperties(
        boolean enabled,
        int sessionMinutes,
        int sessionMaxHours,
        String backupDir,
        String diskPath,
        int auditRetentionDays,
        Attention attention
) {
    public AdminProperties {
        if (sessionMinutes < 1 || sessionMinutes > 120) {
            throw new IllegalStateException("APP_ADMIN_SESSION_MINUTES must be between 1 and 120");
        }
        if (sessionMaxHours < 1 || sessionMaxHours > 24) {
            throw new IllegalStateException("APP_ADMIN_SESSION_MAX_HOURS must be between 1 and 24");
        }
        if (attention == null) attention = new Attention(24, 2, 48, 3, 30, 14);
        if (diskPath == null || diskPath.isBlank()) diskPath = "/";
    }

    public Duration sessionWindow() {
        return Duration.ofMinutes(sessionMinutes);
    }

    public Duration sessionMax() {
        return Duration.ofHours(sessionMaxHours);
    }

    /** "Needs help" thresholds (AttentionRules). */
    public record Attention(int unverifiedHours, int syncFailures, int syncStaleHours, int stuckDays,
                            int emailProblemDays, int inactiveDays) {}
}
