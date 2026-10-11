package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import com.naumvlavceski.bookingbackend.service.IcalSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class IcalSyncScheduler {
    private static final Duration SYNC_INTERVAL = Duration.ofMinutes(10);
    private static final int BATCH_SIZE = 5;

    private final ExternalCalendarRepository calendarRepository;
    private final IcalSyncService syncService;

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void tick() {
        Instant cutoff = Instant.now().minus(SYNC_INTERVAL);
        for (ExternalCalendar c : calendarRepository.findDue(cutoff, PageRequest.of(0, BATCH_SIZE))) {
            try {
                syncService.sync(c.getId());
            } catch (Exception e) {
                log.warn("Unexpected error syncing calendar {}", c.getId(), e);
            }
        }
    }
}
