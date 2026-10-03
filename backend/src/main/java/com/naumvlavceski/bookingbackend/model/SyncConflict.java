package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Data
public class SyncConflict {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID ownerId;

    @Column(nullable = false)
    private UUID unitId;

    @Column(nullable = false)
    private UUID externalCalendarId;

    @Column(nullable = false, length = 500)
    private String externalUid;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationSource platform;

    @Column(nullable = false)
    private LocalDate incomingStart;

    @Column(nullable = false)
    private LocalDate incomingEnd;

    @Column(length = 500)
    private String incomingSummary;

    private UUID conflictingReservationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ConflictKind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ConflictStatus status;

    private LocalDateTime resolvedAt;

    @CreationTimestamp
    private LocalDateTime createdAt;
    @UpdateTimestamp
    private LocalDateTime updatedAt;

}
