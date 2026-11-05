package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UnitRequest(
        @Schema(example = "Room 2") @NotBlank @Size(max = 255) String name,
        @Schema(description = "Maximum number of guests (1 to 100)", example = "2") @NotNull @Min(1) @Max(100) Integer capacity
) {
}
