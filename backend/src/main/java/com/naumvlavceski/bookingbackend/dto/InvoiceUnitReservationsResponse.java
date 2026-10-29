package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record InvoiceUnitReservationsResponse(
        UUID unitId,
        String unitName,
        UUID propertyId,
        String propertyName,
        long totalDays,
        BigDecimal earnings,
        long reservationCount,
        long reservationsWithoutAmount,
        String currency,
        PageResponse<Item> reservations
) {
    public record Item(
            UUID reservationId,
            String guestName,
            LocalDate checkIn,
            LocalDate checkOut,
            int nights,
            ReservationStatus status,
            ReservationSource source,
            BigDecimal totalAmount
    ) {}
}
