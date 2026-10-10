package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UnitRequest(
        @NotBlank @Size(max = 255) String name,
        @NotNull @Min(1) @Max(100) Integer capacity
) {
}
