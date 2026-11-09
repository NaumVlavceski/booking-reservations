package com.naumvlavceski.bookingbackend.dto;


import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.UUID;

public record PropertyResponse(
        @Schema(example = "5d2a8f10-6c3b-4e7d-9f1a-2b3c4d5e6f70") UUID id,
        @Schema(example = "Lakeside Apartments") String name,
        @Schema(example = "Kej Marshal Tito 12, Ohrid") String address,
        @Schema(description = "Server time, no time zone", example = "2026-06-01T09:30:00") LocalDateTime createdAt
) {

}
