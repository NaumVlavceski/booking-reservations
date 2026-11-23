package com.naumvlavceski.bookingbackend.admin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.OffsetDateTime;

/**
 * admin_audit_log is append-only: this daily job is the only thing that deletes from it, and only rows older than
 * app.admin.audit-retention-days (APP_AUDIT_RETENTION_DAYS, default 730).
 */
@Slf4j
@Component
public class AdminAuditRetentionScheduler {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final int retentionDays;

    AdminAuditRetentionScheduler(JdbcTemplate jdbc, Clock clock,
                                 @Value("${app.admin.audit-retention-days:730}") int retentionDays) {
        if (retentionDays < 1) throw new IllegalStateException("APP_AUDIT_RETENTION_DAYS must be at least 1");
        this.jdbc = jdbc;
        this.clock = clock;
        this.retentionDays = retentionDays;
    }

    @Scheduled(cron = "0 50 3 * * *")
    public void purgeOldRows() {
        int removed = jdbc.update("DELETE FROM admin_audit_log WHERE created_at < ?",
                OffsetDateTime.now(clock).minusDays(retentionDays));
        if (removed > 0) log.info("Removed {} admin_audit_log rows older than {} days", removed, retentionDays);
    }
}
