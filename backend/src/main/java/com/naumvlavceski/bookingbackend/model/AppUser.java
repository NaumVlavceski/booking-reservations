package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.ToString;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Data
@ToString(exclude = "passwordHash")
public class AppUser {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "owner_id", nullable = false)
    private Owner owner;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @ColumnDefault("'OWNER'")
    private Role role = Role.OWNER;
    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean active = true;

    private LocalDateTime lastLoginAt;

    @ColumnDefault("0")
    @Column(nullable = false)
    private int tokenVersion = 0;

    private java.time.OffsetDateTime emailVerifiedAt;

    /** When the Terms and Privacy Policy were accepted, and which versions (frontend src/legal/versions.ts). */
    private java.time.OffsetDateTime termsAcceptedAt;
    private String termsVersion;
    private String privacyVersion;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

}
