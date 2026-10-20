package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.ToString;

import java.time.Instant;
import java.util.UUID;

/**
 * One "forgot password" request: an emailed code and, once that code is right, a short-lived reset token.
 * Only hashes are stored. The code is spent once the token is set; {@code usedAt} closes the row for good.
 */
@Entity
@Data
@ToString(exclude = {"codeHash", "resetTokenHash"})
public class PasswordReset {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String codeHash;

    @Column(nullable = false)
    private Instant codeExpiresAt;

    @Column(nullable = false)
    private int attempts;

    private String resetTokenHash;

    private Instant resetTokenExpiresAt;

    private Instant usedAt;

    @Column(nullable = false)
    private Instant createdAt;
}
