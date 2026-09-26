package com.naumvlavceski.bookingbackend.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record UnitResponse(
        UUID id,
        UUID propertyId,
        String name,
        Integer capacity,
        LocalDateTime createdAt
){
}
