package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
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