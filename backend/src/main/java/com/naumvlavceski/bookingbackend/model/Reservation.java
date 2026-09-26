package com.naumvlavceski.bookingbackend.model;

import io.hypersistence.utils.hibernate.type.range.Range;
import io.hypersistence.utils.hibernate.type.range.PostgreSQLRangeType;
import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;
import org.hibernate.annotations.Type;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Data
@FilterDef(name = "ownerFilter", parameters = @ParamDef(name = "ownerId", type = UUID.class))
@Filter(name = "ownerFilter", condition = "owner_id = :ownerId")
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "unit_id", nullable = false)
    private Unit unit;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Type(PostgreSQLRangeType.class)
    @Column(name = "stay_range", columnDefinition = "daterange", nullable = false)
    private Range<LocalDate> stayRange;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationStatus status = ReservationStatus.CONFIRMED;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationSource source = ReservationSource.DIRECT;


    private String guestName;

    private String guestEmail;
    private String guestPhone;

    @Column(nullable = false)
    private Integer guestsCount = 1;

    @Column(precision = 10, scale = 2)
    private BigDecimal pricePerGuest;

    @Column(precision = 10, scale = 2)
    private BigDecimal nightlyRate;

    @Column(precision = 10, scale = 2)
    private BigDecimal totalAmount;

    private String notes;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}