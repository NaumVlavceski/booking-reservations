package com.naumvlavceski.bookingbackend.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;

/** Deletes email_log rows (recipient address, subject) once they are older than app.mail.log-retention-days. */
@Slf4j
@Component
public class EmailLogCleanupScheduler {
    private final EmailLogRepository logs;
    private final Clock clock;
    private final int retentionDays;

    EmailLogCleanupScheduler(EmailLogRepository logs, Clock clock,
                             @Value("${app.mail.log-retention-days:90}") int retentionDays) {
        if (retentionDays < 1) throw new IllegalStateException("app.mail.log-retention-days must be at least 1");
        this.logs = logs;
        this.clock = clock;
        this.retentionDays = retentionDays;
    }

    @Scheduled(cron = "0 45 3 * * *")
    @Transactional
    public void purgeOldRows() {
        int removed = logs.deleteOlderThan(OffsetDateTime.now(clock).minusDays(retentionDays));
        if (removed > 0) log.info("Removed {} email_log rows older than {} days", removed, retentionDays);
    }
}
