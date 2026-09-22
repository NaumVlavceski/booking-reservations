package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ReservationResponse(
        UUID id,
        UUID unitId,
        LocalDate checkIn,
        LocalDate checkOut,
        ReservationStatus status,
        ReservationSource source,
        String guestName,
        String guestEmail,
        String guestPhone,
        Integer guestsCount,
        BigDecimal nightlyRate,
        BigDecimal totalAmount,
        String currency
) {

}
