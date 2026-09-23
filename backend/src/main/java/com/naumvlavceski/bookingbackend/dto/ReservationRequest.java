package com.naumvlavceski.bookingbackend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ReservationRequest(
        UUID unitId,
        LocalDate checkIn,
        LocalDate checkOut,
        BigDecimal pricePerGuest,
        BigDecimal nightlyRate,
        BigDecimal totalAmount,
        String guestName,
        String guestEmail,
        String guestPhone,
        Integer guestsCount,
        String notes
) {
}
