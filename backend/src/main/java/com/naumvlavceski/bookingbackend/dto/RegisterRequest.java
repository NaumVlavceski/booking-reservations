package com.naumvlavceski.bookingbackend.dto;

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
        @Size(max = 255) String contactPhone,
        @NotBlank @Email @Size(max = 255) String email,
        @ValidPassword String password,
        @NotBlank @Size(max = 255) String fullName,
        @NotNull(message = "must be accepted") @AssertTrue(message = "must be accepted") Boolean acceptedTerms,
        @NotBlank @Pattern(regexp = LEGAL_VERSION) String termsVersion,
        @NotBlank @Pattern(regexp = LEGAL_VERSION) String privacyVersion
) {
    public static final String LEGAL_VERSION = "\\d{4}-\\d{2}-\\d{2}";
}
