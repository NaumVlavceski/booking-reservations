package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.UUID;

@Schema(description = "A unit (room) of a property")
public record UnitResponse(
        @Schema(example = "3b9f6c2e-8d41-4f0a-9a57-1c2d3e4f5a6b") UUID id,
        @Schema(example = "5d2a8f10-6c3b-4e7d-9f1a-2b3c4d5e6f70") UUID propertyId,
        @Schema(example = "Room 2") String name,
        @Schema(description = "Maximum number of guests", example = "2") Integer capacity,
        @Schema(description = "Server time, no time zone", example = "2026-06-01T09:30:00") LocalDateTime createdAt,
        @Schema(description = "Secret key of this unit's public calendar feed (`/api/ical/{token}.ics`), which "
                + "Booking.com reads. Anyone with it can read the unit's busy dates and guest names, so treat it "
                + "like a password.", example = "0000000000000000000000000000000000000000000000000000000000000000")
        String token
){
}
