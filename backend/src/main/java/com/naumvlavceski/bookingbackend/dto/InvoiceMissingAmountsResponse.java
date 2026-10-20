package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;

import java.time.LocalDate;
import java.util.UUID;

public record InvoiceMissingAmountsResponse(
        UUID propertyId,
        String propertyName,
        UUID unitId,
        String unitName,
        PageResponse<Item> reservations
) {
    public record Item(
            UUID reservationId,
            UUID unitId,
            String unitName,
            String guestName,
            LocalDate checkIn,
            LocalDate checkOut,
            int nights,
            ReservationStatus status,
            ReservationSource source
    ) {}
}
