package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.OffsetDateTime;

/** The signed-in account. The accepted legal versions let the app ask for re-acceptance when a document changes. */
public record MeResponse(String email, String fullName, String termsVersion, String privacyVersion,
                         OffsetDateTime termsAcceptedAt,
                         @Schema(description = "A temporary demo from POST /api/auth/demo: sample data, deleted after "
                                 + "its lifetime, with a few account actions turned off")
                         boolean demo) {}
