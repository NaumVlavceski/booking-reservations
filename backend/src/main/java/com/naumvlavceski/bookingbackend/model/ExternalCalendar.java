package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Data
public class ExternalCalendar {
    @Id
    private UUID id;
    @Column(name = "unit_id", nullable = false)
    private UUID unitId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationSource platform;

    @Column(length = 1000, nullable = false)
    private String icsUrl;

    private Instant lastSyncedAt;

    private Instant lastSuccessAt;

    @Column(length = 1000)
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Column(nullable = false)
    private int consecutiveFailures = 0;

    /** A booking went missing from the last read; the next read, which confirms the cancellation, comes sooner. */
    @Column(nullable = false)
    private boolean recheckSoon = false;

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID();
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
