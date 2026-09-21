package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.NotBlank;

public record PropertyRequest(
        String name,
        String address,
        String timezone
) {
}
