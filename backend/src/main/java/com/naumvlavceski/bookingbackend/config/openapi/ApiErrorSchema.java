package com.naumvlavceski.bookingbackend.config.openapi;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

/**
 * Documentation only: the error body GlobalExceptionHandler builds as a map. Never instantiated; it gives the
 * OpenAPI spec one schema for every error response. Keep it in step with the handler.
 */
@Schema(name = ApiErrorSchema.NAME, description = "Error body. Only the fields that apply are present.")
public record ApiErrorSchema(
        @Schema(description = "When the error happened (UTC)", example = "2026-11-02T10:15:30Z")
        Instant timestamp,
        @Schema(description = "HTTP status", example = "409")
        int status,
        @Schema(description = "HTTP reason phrase", example = "Conflict")
        String error,
        @Schema(description = "Safe to show to a user", example = "Room 2 is already booked on some of these dates.")
        String message,
        @Schema(description = "Stable error code to branch on. Absent on wrong-credential 401s.",
                allowableValues = {"BAD_REQUEST", "VALIDATION_FAILED", "INVALID_CODE", "RESET_TOKEN_INVALID",
                        "WRONG_PASSWORD", "EMAIL_NOT_VERIFIED", "DEMO_RESTRICTED", "NOT_FOUND", "DATES_TAKEN",
                        "CONFLICT", "RATE_LIMITED", "INTERNAL"},
                example = "DATES_TAKEN")
        String code,
        @Schema(description = "VALIDATION_FAILED only: one message per invalid field",
                example = "{\"checkOut\": \"Check out must not be null\"}")
        Map<String, String> fieldErrors,
        @Schema(description = "DATES_TAKEN (found by the check) only: the unit that is taken", example = "Room 2")
        String room,
        @Schema(description = "DATES_TAKEN (found by the check) only: check-in of the colliding booking", example = "2026-07-10")
        LocalDate takenFrom,
        @Schema(description = "DATES_TAKEN (found by the check) only: check-out of the colliding booking", example = "2026-07-14")
        LocalDate takenTo,
        @Schema(description = "RATE_LIMITED only: seconds to wait, same as the Retry-After header", example = "780")
        Long retryAfterSeconds,
        @Schema(description = "EMAIL_NOT_VERIFIED only: the address that still needs its code", example = "owner@example.com")
        String email,
        @Schema(description = "INTERNAL only: quote it when reporting the problem", example = "3f1c2a9e-5b7d-4e8a-9c1f-2d6b7a8e9f01")
        String errorId
) {
    public static final String NAME = "ApiError";
}
