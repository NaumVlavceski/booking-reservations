package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.demo.DemoGuard;
import com.naumvlavceski.bookingbackend.exception.DemoRestrictedException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_ACCOUNT)
public class NotificationController {
    private final EmailService emailService;
    private final AppUserRepository appUserRepository;
    private final OwnerRepository ownerRepository;

    public record SettingsRequest(
            @Schema(description = "Send booking emails (new, changed and cancelled imported bookings, conflicts, "
                    + "failing syncs)", example = "true")
            @NotNull Boolean enabled) {}

    @Operation(summary = "Booking email settings", description = "Answers `{\"enabled\": true|false}`.")
    @GetMapping("/settings")
    public Map<String, Boolean> getSettings(@CurrentUserId UUID ownerId) {
        return Map.of("enabled", requireOwner(ownerId).isNotificationsEnabled());
    }

    @Operation(summary = "Turn booking emails on or off",
            description = "Account emails (codes, password changes) are always sent. Answers `{\"enabled\": ...}`.")
    @ApiResponse(responseCode = "200", description = "Saved")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @PutMapping("/settings")
    public Map<String, Boolean> updateSettings(@CurrentUserId UUID ownerId,
                                               @Valid @RequestBody SettingsRequest req) {
        Owner owner = requireOwner(ownerId);
        // The demo account's address has no inbox: its booking emails stay off
        if (owner.isDemo() && req.enabled()) throw new DemoRestrictedException(DemoGuard.RESTRICTED);
        owner.setNotificationsEnabled(req.enabled());
        ownerRepository.save(owner);
        return Map.of("enabled", owner.isNotificationsEnabled());
    }

    private Owner requireOwner(UUID ownerId) {
        return ownerRepository.findById(ownerId).orElseThrow(() -> new NoSuchElementException("Owner not found"));
    }
    private static final Duration COOLDOWN = Duration.ofSeconds(60);
    private final Map<UUID, Instant> lastTest = new ConcurrentHashMap<>();

    @Operation(summary = "Send a test email to my address",
            description = "Checks that email delivery works. Answers 202 `{\"status\": \"queued\", \"to\": ...}`. "
                    + "At most once a minute; a second try answers 429 `{\"status\": \"rate_limited\"}`.")
    @ApiResponse(responseCode = "202", description = "Queued")
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @ApiResponse(responseCode = "429", description = "Sent one less than a minute ago")
    @PostMapping("/test")
    public ResponseEntity<Map<String, String>> sendTest(@CurrentUserId UUID ownerId) {
        if (requireOwner(ownerId).isDemo()) throw new DemoRestrictedException(DemoGuard.RESTRICTED);
        Instant now = Instant.now();
        Instant prev = lastTest.get(ownerId);
        if (prev != null && prev.plus(COOLDOWN).isAfter(now)) {
            return ResponseEntity.status(429).body(Map.of("status", "rate_limited"));
        }
        lastTest.put(ownerId, now);
        var user = appUserRepository.findFirstByOwnerId(ownerId)
                .orElseThrow(() -> new NoSuchElementException("User not found"));
        String to = user.getEmail();
        emailService.send(ownerId, "TEST", new EmailMessage(
                to,
                "RoomTrack test email",
                "<p>Email delivery from RoomTrack is working.</p>",
                "Email delivery from RoomTrack is working."));

        return ResponseEntity.accepted().body(Map.of("status", "queued", "to", to));
    }
}