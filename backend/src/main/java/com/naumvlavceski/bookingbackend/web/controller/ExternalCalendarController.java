package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.config.security.IcalUrlGuard;
import com.naumvlavceski.bookingbackend.dto.ExternalCalendarRequest;
import com.naumvlavceski.bookingbackend.dto.ExternalCalendarResponse;
import com.naumvlavceski.bookingbackend.ical.IcalFetchException;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import com.naumvlavceski.bookingbackend.service.IcalSyncService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ExternalCalendarController {

    private static final Duration SYNC_COOLDOWN = Duration.ofSeconds(60);

    private final ExternalCalendarRepository calendarRepository;
    private final UnitRepository unitRepository;
    private final IcalSyncService syncService;

    @GetMapping("/units/{unitId}/calendars")
    public List<ExternalCalendarResponse> list(@CurrentUserId UUID ownerId, @PathVariable UUID unitId) {
        requireOwnedUnit(ownerId, unitId);
        return calendarRepository.findAllByUnitId(unitId).stream()
                .map(ExternalCalendarResponse::from).toList();
    }

    @PostMapping("/units/{unitId}/calendars")
    public ResponseEntity<?> create(@CurrentUserId UUID ownerId, @PathVariable UUID unitId,
                                    @Valid @RequestBody ExternalCalendarRequest request) {
        requireOwnedUnit(ownerId, unitId);
        if (request.platform() == ReservationSource.DIRECT) {
            return ResponseEntity.badRequest().body(Map.of("message", "Choose Booking or Airbnb."));
        }
        boolean exists = calendarRepository.findAllByUnitId(unitId).stream()
                .anyMatch(c -> c.getPlatform() == request.platform());
        if (exists) {
            return ResponseEntity.status(409)
                    .body(Map.of("message", "This room already has a calendar for that platform."));
        }
        try {
            IcalUrlGuard.validate(request.icsUrl());
        } catch (IcalFetchException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }

        ExternalCalendar calendar = new ExternalCalendar();
        calendar.setUnitId(unitId);
        calendar.setPlatform(request.platform());
        calendar.setIcsUrl(request.icsUrl().trim());
        return ResponseEntity.ok(ExternalCalendarResponse.from(calendarRepository.save(calendar)));
    }

    @DeleteMapping("/calendars/{id}")
    public ResponseEntity<Void> delete(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        calendarRepository.delete(requireOwnedCalendar(ownerId, id));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/calendars/{id}/sync")
    public ResponseEntity<?> syncNow(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        ExternalCalendar calendar = requireOwnedCalendar(ownerId, id);

        LocalDateTime last = calendar.getLastSyncedAt();
        if (last != null && last.isAfter(LocalDateTime.now().minus(SYNC_COOLDOWN))) {
            long wait = Math.max(1, SYNC_COOLDOWN.minus(Duration.between(last, LocalDateTime.now())).toSeconds());
            return ResponseEntity.status(429)
                    .header("Retry-After", String.valueOf(wait))
                    .body(Map.of("message", "Synced a moment ago. Try again in " + wait + "s."));
        }
        syncService.sync(id);
        return ResponseEntity.ok(ExternalCalendarResponse.from(
                calendarRepository.findById(id).orElseThrow()));
    }

    private void requireOwnedUnit(UUID ownerId, UUID unitId) {
        unitRepository.findByIdAndOwnerId(unitId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Unit not found"));
    }

    private ExternalCalendar requireOwnedCalendar(UUID ownerId, UUID id) {
        ExternalCalendar c = calendarRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Calendar not found"));
        requireOwnedUnit(ownerId, c.getUnitId()); // someone else's calendar gets the same 404
        return c;
    }
}
