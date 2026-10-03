package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.*;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Entity
@Data
@FilterDef(name = "ownerFilter", parameters = @ParamDef(name = "ownerId", type = UUID.class))
@Filter(name = "ownerFilter", condition = "owner_id = :ownerId")
public class Unit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "property_id", nullable = false)
    private Property property;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private Integer capacity;


    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    @Column(name="ical_token",nullable = false, unique = true,updatable =false)
    private String icalToken = generateToken();

    private static final SecureRandom RANDOM = new SecureRandom();

    private static String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes); // 64 hex chars, same shape as the DB default
    }
}