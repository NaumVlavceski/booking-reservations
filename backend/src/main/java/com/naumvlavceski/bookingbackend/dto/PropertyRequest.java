package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PropertyRequest(
        @Schema(example = "Lakeside Apartments") @NotBlank @Size(max = 255) String name,
        @Schema(example = "Kej Marshal Tito 12, Ohrid") @Size(max = 255) String address,
        @Schema(description = "Create only: how many units to create with it (0 to 200)", example = "3")
        @Min(0) @Max(200) Integer unitCount
) {
}
