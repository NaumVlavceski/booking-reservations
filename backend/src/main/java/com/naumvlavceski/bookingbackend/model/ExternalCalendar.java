package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.Data;

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

    private LocalDateTime lastSyncedAt;

    private LocalDateTime lastSuccessAt;

    @Column(length = 1000)
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

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
