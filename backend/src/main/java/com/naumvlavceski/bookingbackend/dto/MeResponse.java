package com.naumvlavceski.bookingbackend.dto;

import java.time.OffsetDateTime;

/** The signed-in account. The accepted legal versions let the app ask for re-acceptance when a document changes. */
public record MeResponse(String email, String fullName, String termsVersion, String privacyVersion,
                         OffsetDateTime termsAcceptedAt) {}
