package com.naumvlavceski.bookingbackend.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record UnitResponse(
        UUID id,
        UUID propertyId,
        String name,
        Integer capacity,
        BigDecimal basePrice
){
}
