package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PropertyRequest(
        @NotBlank @Size(max = 255) String name,
        @Size(max = 255) String address,
        @Min(0) @Max(200) Integer unitCount
) {
}
