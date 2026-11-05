package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Schema(description = "A booking of one unit. Amounts are plain numbers without a currency.")
public record ReservationRequest(
        @Schema(description = "The unit (room) being booked", example = "3b9f6c2e-8d41-4f0a-9a57-1c2d3e4f5a6b")
        @NotNull UUID unitId,
        @Schema(description = "Arrival day (yyyy-MM-dd)", example = "2026-07-10")
        @NotNull LocalDate checkIn,
        @Schema(description = "Departure day (yyyy-MM-dd), after checkIn. The unit is free again that day.", example = "2026-07-14")
        @NotNull LocalDate checkOut,
        @Schema(description = "Defaults to CONFIRMED when creating, and to the current status when changing")
        ReservationStatus status,
        @Schema(description = "Price per guest, if the owner prices that way", example = "25.00")
        @DecimalMin("0") BigDecimal pricePerGuest,
        @Schema(description = "Price per night", example = "60.00")
        @DecimalMin("0") BigDecimal nightlyRate,
        @Schema(description = "Total of the stay; what the earnings overview adds up", example = "240.00")
        @DecimalMin("0") BigDecimal totalAmount,
        @Schema(example = "Ana Petrova") @Size(max = 255) String guestName,
        @Schema(example = "guest@example.com") @Email @Size(max = 255) String guestEmail,
        @Schema(example = "+389 70 000 000") @Size(max = 255) String guestPhone,
        @Schema(description = "1 to 100; defaults to 2", example = "2") @Min(1) @Max(100) Integer guestsCount,
        @Schema(example = "Late arrival, around 22:00") @Size(max = 255) String notes
) {
}
