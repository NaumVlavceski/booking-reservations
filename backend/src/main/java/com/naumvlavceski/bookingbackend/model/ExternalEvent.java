package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import lombok.Data;

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

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID();
        createdAt = LocalDateTime.now();
    }

}
