package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.openapi.MessageSchema;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.config.security.IcalUrlGuard;
import com.naumvlavceski.bookingbackend.demo.DemoGuard;
import com.naumvlavceski.bookingbackend.dto.ExternalCalendarRequest;
import com.naumvlavceski.bookingbackend.dto.ExternalCalendarResponse;
import com.naumvlavceski.bookingbackend.ical.IcalFetchException;
import com.naumvlavceski.bookingbackend.ical.PlatformDetector;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import com.naumvlavceski.bookingbackend.service.IcalSyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_CALENDAR_SYNC)
public class ExternalCalendarController {

    private static final Duration SYNC_COOLDOWN = Duration.ofSeconds(60);

    private final ExternalCalendarRepository calendarRepository;
    private final UnitRepository unitRepository;
    private final IcalSyncService syncService;
    private final DemoGuard demoGuard;

    @Operation(summary = "List a unit's connected calendars",
            description = "The Booking.com calendar link of the unit (at most one), with its sync health.")
    @ApiResponse(responseCode = "200", description = "Connected calendars")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/units/{unitId}/calendars")
    public List<ExternalCalendarResponse> list(@CurrentUserId UUID ownerId, @PathVariable UUID unitId) {
        Unit unit = requireOwnedUnit(ownerId, unitId);
        return calendarRepository.findAllByUnitId(unitId).stream()
                .map(c->ExternalCalendarResponse.from(c,unit.getName())).toList();
    }

    @Operation(summary = "Connect a Booking.com calendar link",
            description = "The channel is detected from the link; only Booking.com links (https, `*.booking.com`) "
                    + "are accepted for now. Links to private or local network addresses are refused. Its bookings "
                    + "are imported on the next sync (about every 10 minutes, or POST /api/calendars/{id}/sync).")
    @ApiResponse(responseCode = "200", description = "Connected",
            content = @Content(schema = @Schema(implementation = ExternalCalendarResponse.class)))
    @ApiResponse(responseCode = "400", description = "Not a Booking.com link, not https, or a private address "
            + "(body has only `message`)", content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @ApiResponse(responseCode = "409", description = "The unit already has a Booking.com calendar (body has only "
            + "`message`)", content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @PostMapping("/units/{unitId}/calendars")
    public ResponseEntity<?> create(@CurrentUserId UUID ownerId, @PathVariable UUID unitId,
                                    @Valid @RequestBody ExternalCalendarRequest request) {
        Unit unit = requireOwnedUnit(ownerId, unitId);
        // Anyone can sign in to the demo: it must not make the server fetch addresses strangers typed
        demoGuard.requireNotDemo(ownerId);
        String icsUrl = PlatformDetector.normalize(request.icsUrl());
        ReservationSource platform = PlatformDetector.detect(icsUrl).orElse(null);
        if (platform == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Only Booking.com calendar links are supported."));
        }
        boolean exists = calendarRepository.findAllByUnitId(unitId).stream()
                .anyMatch(c -> c.getPlatform() == platform);
        if (exists) {
            return ResponseEntity.status(409).body(Map.of("message",
                    "This room already has a Booking.com calendar."));
        }
        try {
            IcalUrlGuard.validate(icsUrl);
        } catch (IcalFetchException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }

        ExternalCalendar calendar = new ExternalCalendar();
        calendar.setUnitId(unitId);
        calendar.setPlatform(platform);
        calendar.setIcsUrl(icsUrl);
        return ResponseEntity.ok(ExternalCalendarResponse.from(calendarRepository.save(calendar),unit.getName()));
    }

    @Operation(summary = "Disconnect a calendar",
            description = "Stops the import. Bookings that were already imported stay.")
    @ApiResponse(responseCode = "204", description = "Disconnected")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @DeleteMapping("/calendars/{id}")
    public ResponseEntity<Void> delete(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        calendarRepository.delete(requireOwnedCalendar(ownerId, id));
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Sync one calendar now",
            description = "Downloads the feed and reconciles it right away instead of waiting for the next run. "
                    + "A failed download is not an error here: it shows in `lastError` and `consecutiveFailures`. "
                    + "At most once a minute per calendar.")
    @ApiResponse(responseCode = "200", description = "Done (check lastError to see whether it worked)",
            content = @Content(schema = @Schema(implementation = ExternalCalendarResponse.class)))
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @ApiResponse(responseCode = "429", description = "Synced less than a minute ago (body has only `message`, plus "
            + "a Retry-After header)", content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @PostMapping("/calendars/{id}/sync")
    public ResponseEntity<?> syncNow(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        ExternalCalendar calendar = requireOwnedCalendar(ownerId, id);
        Unit unit = requireOwnedUnit(ownerId, calendar.getUnitId());
        Instant last = calendar.getLastSyncedAt();
        if (last != null && last.isAfter(Instant.now().minus(SYNC_COOLDOWN))) {
            long wait = Math.max(1, SYNC_COOLDOWN.minus(Duration.between(last, Instant.now())).toSeconds());
            return ResponseEntity.status(429)
                    .header("Retry-After", String.valueOf(wait))
                    .body(Map.of("message", "Synced a moment ago. Try again in " + wait + "s."));
        }
        syncService.sync(id);
        return ResponseEntity.ok(ExternalCalendarResponse.from(
                calendarRepository.findById(id).orElseThrow(),unit.getName()));
    }

    @Operation(summary = "Calendars whose last sync failed",
            description = "Every connected calendar of the owner whose most recent sync ended with an error.")
    @GetMapping("/calendars/health")
    public List<ExternalCalendarResponse> health(@CurrentUserId UUID ownerId) {
        List<ExternalCalendar> failing = calendarRepository.findFailingByOwner(ownerId);
        Map<UUID, String> unitNames = unitRepository
                .findAllById(failing.stream().map(ExternalCalendar::getUnitId).distinct().toList())
                .stream().collect(Collectors.toMap(Unit::getId, Unit::getName));
        return failing.stream()
                .map(c -> ExternalCalendarResponse.from(c, unitNames.get(c.getUnitId())))
                .toList();
    }

    @Operation(summary = "Sync all my calendars now",
            description = "Calendars synced in the last minute are skipped. Answers `{triggered, skipped, total}`.")
    @PostMapping("/calendars/sync-all")
    public ResponseEntity<?> syncAll(@CurrentUserId UUID ownerId) {
        List<ExternalCalendar> calendars = calendarRepository.findAllByOwnerId(ownerId);

        int triggered = 0;
        int skipped = 0;
        Instant now = Instant.now();

        for (ExternalCalendar c : calendars) {
            boolean onCooldown = c.getLastSyncedAt() != null
                    && c.getLastSyncedAt().isAfter(now.minus(SYNC_COOLDOWN));
            if (onCooldown) {
                skipped++;
                continue;
            }
            syncService.sync(c.getId());
            triggered++;
        }

        return ResponseEntity.ok(Map.of(
                "triggered", triggered,
                "skipped", skipped,
                "total", calendars.size()
        ));
    }

    private Unit requireOwnedUnit(UUID ownerId, UUID unitId) {
        return unitRepository.findByIdAndOwnerId(unitId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Room not found"));
    }

    private ExternalCalendar requireOwnedCalendar(UUID ownerId, UUID id) {
        // Someone else's calendar and an unknown id get the same 404
        return calendarRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Calendar not found"));
    }
}
