package com.naumvlavceski.bookingbackend.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "CONFIRMED: booked. PAID: booked and paid. BLOCK: the owner closed these nights (no guest). "
        + "CANCELLED: no longer holds the nights. Every status except CANCELLED blocks overlapping bookings; "
        + "earnings count only CONFIRMED and PAID.")
public enum ReservationStatus {
    CONFIRMED,CANCELLED,PAID,BLOCK
}
