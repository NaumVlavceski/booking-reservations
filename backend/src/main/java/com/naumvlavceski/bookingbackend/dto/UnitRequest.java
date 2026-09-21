package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.math.BigInteger;

public record UnitRequest(
        String name,
        Integer capacity,
        BigDecimal basePrice

) {
}
