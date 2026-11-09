package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Sign-up. The Terms and Privacy Policy must be accepted; the versions are the ones the page showed
 * (frontend src/legal/versions.ts, dates like 2026-10-30) and are stored with the server's timestamp.
 */
public record RegisterRequest(
        @Schema(example = "+389 70 000 000") @Size(max = 255) String contactPhone,
        @Schema(example = "owner@example.com") @NotBlank @Email @Size(max = 255) String email,
        @Schema(description = "8 to 72 characters", example = "correct horse battery") @ValidPassword String password,
        @Schema(example = "Marija Stojanovska") @NotBlank @Size(max = 255) String fullName,
        @Schema(description = "Must be true: the Terms and the Privacy Policy were accepted", example = "true")
        @NotNull(message = "must be accepted") @AssertTrue(message = "must be accepted") Boolean acceptedTerms,
        @Schema(description = "Version (date) of the Terms that was shown", example = "2026-10-31")
        @NotBlank @Pattern(regexp = LEGAL_VERSION) String termsVersion,
        @Schema(description = "Version (date) of the Privacy Policy that was shown", example = "2026-10-31")
        @NotBlank @Pattern(regexp = LEGAL_VERSION) String privacyVersion
) {
    public static final String LEGAL_VERSION = "\\d{4}-\\d{2}-\\d{2}";
}
