package com.naumvlavceski.bookingbackend.dto;


import java.time.LocalDateTime;
import java.util.UUID;

public record PropertyResponse(
        UUID id,
        String name,
        String address,
        LocalDateTime createdAt
) {

}
