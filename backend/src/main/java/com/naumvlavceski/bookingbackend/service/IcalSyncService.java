package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.ical.IcalFetcher;
import com.naumvlavceski.bookingbackend.ical.IcalParser;
import com.naumvlavceski.bookingbackend.ical.IcalReconciler;
import com.naumvlavceski.bookingbackend.ical.ParsedIcalEvent;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class IcalSyncService {

    private final ExternalCalendarRepository calendarRepository;
    private final IcalReconciler reconciler;
    private final Set<UUID> inProgress = ConcurrentHashMap.newKeySet();

    public void sync(UUID calendarId) {
        if (!inProgress.add(calendarId)) return; // scheduler and manual sync must not overlap
        try {
            ExternalCalendar calendar = calendarRepository.findById(calendarId).orElseThrow(()->new NoSuchElementException("Calendar not found"));

            Instant startedAt = Instant.now();
            try {
                String ics = IcalFetcher.fetch(calendar.getIcsUrl());
                List<ParsedIcalEvent> events = IcalParser.parse(ics);
                reconciler.reconcile(calendar, events);
                calendar.setLastSyncedAt(startedAt);
                calendar.setLastSuccessAt(startedAt);
                calendar.setLastError(null);
                calendar.setConsecutiveFailures(0);
            } catch (Exception e) {
                log.warn("Sync failed for calendar {}: {}", calendarId, e.getMessage());
                calendar.setLastSyncedAt(startedAt);
                calendar.setLastError(truncate(e.getMessage()));
                calendar.setConsecutiveFailures(calendar.getConsecutiveFailures() + 1);
            }
            calendarRepository.save(calendar);
        } finally {
            inProgress.remove(calendarId);
        }
    }

    private static String truncate(String s) {
        if (s == null) return "Unknown error";
        return s.length() > 900 ? s.substring(0, 900) : s;
    }
}
