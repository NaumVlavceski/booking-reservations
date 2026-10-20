package com.naumvlavceski.bookingbackend.dto;

import java.util.UUID;

public record InvoicePropertyResponse(
        UUID propertyId,
        String propertyName,
        long unitCount) {
}
