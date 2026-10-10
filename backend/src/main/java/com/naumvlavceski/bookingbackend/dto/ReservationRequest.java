package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ReservationRequest(
        @NotNull UUID unitId,
        @NotNull LocalDate checkIn,
        @NotNull LocalDate checkOut,
        ReservationStatus status,
        @DecimalMin("0") BigDecimal pricePerGuest,
        @DecimalMin("0") BigDecimal nightlyRate,
        @DecimalMin("0") BigDecimal totalAmount,
        @Size(max = 255) String guestName,
        @Email @Size(max = 255) String guestEmail,
        @Size(max = 255) String guestPhone,
        @Min(1) @Max(100) Integer guestsCount,
        @Size(max = 255) String notes
) {
}
