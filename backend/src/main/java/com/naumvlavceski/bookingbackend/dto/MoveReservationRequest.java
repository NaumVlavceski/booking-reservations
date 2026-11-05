package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record MoveReservationRequest(
        @Schema(description = "Target unit, in the same property", example = "7e1f3a5c-2b4d-4c6e-8f0a-1b2c3d4e5f60")
        @NotNull UUID unitId) {
}
