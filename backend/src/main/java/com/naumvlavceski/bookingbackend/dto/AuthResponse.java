package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record AuthResponse(
        @Schema(description = "JWT for the `Authorization: Bearer` header", example = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lckBleGFtcGxlLmNvbSJ9.c2lnbmF0dXJl")
        String token,
        @Schema(example = "owner@example.com") String email,
        @Schema(example = "Marija Stojanovska") String fullName) {}
