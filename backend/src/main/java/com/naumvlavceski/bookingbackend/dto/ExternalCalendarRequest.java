package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The channel is not sent: it is worked out from the link (see PlatformDetector). */
public record ExternalCalendarRequest(
        @Schema(description = "The calendar export link from the Booking.com extranet (https; webcal:// is accepted too)",
                example = "https://ical.booking.com/v1/export?t=00000000-0000-0000-0000-000000000000")
        @NotBlank @Size(max = 1000) String icsUrl) {
}
