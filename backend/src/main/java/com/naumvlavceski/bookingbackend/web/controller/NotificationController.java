package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
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
public class NotificationController {
    private final EmailService emailService;
    private final AppUserRepository appUserRepository;
    private final OwnerRepository ownerRepository;

    public record SettingsRequest(@NotNull Boolean enabled) {}

    @GetMapping("/settings")
    public Map<String, Boolean> getSettings(@CurrentUserId UUID ownerId) {
        return Map.of("enabled", requireOwner(ownerId).isNotificationsEnabled());
    }

    @PutMapping("/settings")
    public Map<String, Boolean> updateSettings(@CurrentUserId UUID ownerId,
                                               @Valid @RequestBody SettingsRequest req) {
        Owner owner = requireOwner(ownerId);
        owner.setNotificationsEnabled(req.enabled());
        ownerRepository.save(owner);
        return Map.of("enabled", owner.isNotificationsEnabled());
    }

    private Owner requireOwner(UUID ownerId) {
        return ownerRepository.findById(ownerId).orElseThrow(() -> new NoSuchElementException("Owner not found"));
    }
    private static final Duration COOLDOWN = Duration.ofSeconds(60);
    private final Map<UUID, Instant> lastTest = new ConcurrentHashMap<>();

    @PostMapping("/test")
    public ResponseEntity<Map<String, String>> sendTest(@CurrentUserId UUID ownerId) {
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