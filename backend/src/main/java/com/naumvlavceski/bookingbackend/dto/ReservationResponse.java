package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ReservationResponse(
        @Schema(example = "9c4e2b71-0f3a-4d5e-8b6c-7a1d2e3f4b5c") UUID id,
        @Schema(example = "3b9f6c2e-8d41-4f0a-9a57-1c2d3e4f5a6b") UUID unitId,
        @Schema(description = "Arrival day", example = "2026-07-10") LocalDate checkIn,
        @Schema(description = "Departure day (not a booked night)", example = "2026-07-14") LocalDate checkOut,
        ReservationStatus status,
        ReservationSource source,
        @Schema(description = "For imported bookings: the event title from the feed", example = "Ana Petrova") String guestName,
        @Schema(example = "guest@example.com") String guestEmail,
        @Schema(example = "+389 70 000 000") String guestPhone,
        @Schema(example = "2") Integer guestsCount,
        @Schema(example = "25.00") BigDecimal pricePerGuest,
        @Schema(example = "60.00") BigDecimal nightlyRate,
        @Schema(example = "240.00") BigDecimal totalAmount,
        @Schema(example = "Late arrival, around 22:00") String notes,
        @Schema(description = "True when an imported booking's dates changed after an amount was entered: the amount "
                + "may need updating. Cleared by saving the reservation.")
        boolean priceNeedsReview,
        @Schema(description = "True when an imported booking was missing from its calendar's last sync. A live one: a "
                + "following sync (usually within a few minutes) cancels it if it is still missing, or clears this if "
                + "it is back. A cancelled one: restoring it as a channel booking would get it cancelled again; "
                + "restore it with asDirect instead.")
        boolean missingFromFeed,
        @Schema(description = "True for a live booking from a channel that the channel's feed listed at the last sync. "
                + "It is cancelled on the channel, not here (DELETE answers 409 CHANNEL_BOOKING); the sync then "
                + "cancels it here.")
        boolean listedByChannel,
        @Schema(description = "When it was cancelled; null unless status is CANCELLED", example = "2026-06-30T08:12:00Z")
        OffsetDateTime cancelledAt
) {
}
