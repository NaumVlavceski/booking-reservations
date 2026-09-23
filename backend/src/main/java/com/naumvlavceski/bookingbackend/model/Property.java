package com.naumvlavceski.bookingbackend.model;

import jakarta.annotation.Nullable;
import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.*;
import org.springframework.cglib.core.Local;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Data
@FilterDef(name = "ownerFilter", parameters = @ParamDef(name = "ownerId", type = UUID.class))
@Filter(name = "ownerFilter", condition = "owner_id = :ownerId")
public class Property {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "owner_id", nullable = false)
    private Owner owner;

    @Column(nullable = false)
    private String name;

    private String address;


    @ColumnDefault("'Europe/Skopje'")
    private String timezone = "Europe/Skopje";

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}