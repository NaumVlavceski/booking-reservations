package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Data
public class ExternalEvent {
    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID externalCalendarId;

    @Column(nullable = false, length = 500)
    private String uid;

    private UUID reservationId;

    @Column(nullable = false, length = 64)
    private String rawHash;

    @Column(nullable = false)
    private LocalDateTime lastSeenAt;

    private LocalDateTime createdAt;

    /** When this event first went missing from the feed, and in how many syncs in a row; see IcalReconciler. */
    private Instant missingSince;

    @Column(nullable = false)
    private int missingSyncs = 0;

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID();
        createdAt = LocalDateTime.now();
    }

}
