package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * "Contact support" from inside the app: only the message. The reply address is the signed-in account's own
 * (verified) email, taken from the token, never from the request.
 */
public record SupportRequest(
        @Schema(example = "Bookings from Booking.com stopped showing up yesterday.")
        @NotBlank @Size(max = 5000) String message
) {}
