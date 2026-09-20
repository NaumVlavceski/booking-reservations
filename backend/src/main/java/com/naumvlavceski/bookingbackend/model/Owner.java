package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.Builder;
import lombok.Data;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.cglib.core.Local;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
public class Owner {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(nullable = false)
    private String businessName;
    @Column(nullable = false)
    private String contactEmail;
    private String contactPhone;
    @Column(nullable = false)
    @ColumnDefault("'Europe/Skopje'")
    private String timezone;
    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean active;
    @CreationTimestamp
    private LocalDateTime createdAt;
    @UpdateTimestamp
    private LocalDateTime updatedAt;

}
