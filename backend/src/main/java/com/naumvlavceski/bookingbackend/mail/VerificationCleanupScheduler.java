package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.repository.EmailVerificationRepository;
import com.naumvlavceski.bookingbackend.repository.PasswordResetRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class VerificationCleanupScheduler {
    private static final Duration KEEP = Duration.ofDays(7);

    private final EmailVerificationRepository codes;
    private final PasswordResetRepository resets;

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeOldCodes() {
        Instant cutoff = Instant.now().minus(KEEP);
        int removed = codes.deleteOlderThan(cutoff);
        if (removed > 0) log.info("Removed {} old email verification codes", removed);
        int removedResets = resets.deleteOlderThan(cutoff);
        if (removedResets > 0) log.info("Removed {} old password reset requests", removedResets);
    }
}
