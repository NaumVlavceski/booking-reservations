package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A message from the contact form. The email becomes the Reply-To of the email the owner gets, so it must be one
 * plain address: no spaces, commas or angle brackets that a mail client could read as a second address.
 * {@code website} is a field people never see (hidden on the page); a bot that fills it in gets the normal answer and
 * nothing is sent.
 */
public record ContactRequest(
        @Schema(example = "guest@example.com")
        @NotBlank @Email @Size(max = 255) @Pattern(regexp = "[^\\s@<>,;\"]+@[^\\s@<>,;\"]+", message = "must be a single email address")
        String email,
        @Schema(example = "Question about Booking.com sync") @NotBlank @Size(max = 150) String subject,
        @Schema(example = "Hello, does RoomTrack work with Airbnb too?") @NotBlank @Size(max = 5000) String message,
        @Schema(description = "Leave empty (spam trap)", example = "") @Size(max = 500) String website
) {}
