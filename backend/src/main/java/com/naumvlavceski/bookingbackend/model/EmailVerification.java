package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.ToString;

import java.time.Instant;
import java.util.UUID;

/** One emailed verification code. Only a keyed hash of the code is stored, never the code itself. */
@Entity
@Data
@ToString(exclude = "codeHash")
public class EmailVerification {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String codeHash;

    @Column(nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant consumedAt;
}
