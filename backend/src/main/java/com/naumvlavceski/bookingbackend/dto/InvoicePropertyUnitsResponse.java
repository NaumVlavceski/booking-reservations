package com.naumvlavceski.bookingbackend.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record InvoicePropertyUnitsResponse(
        UUID propertyId,
        String propertyName,
        List<UnitEarnings> units,
        Totals grandTotal,
        String currency
) {
    public record UnitEarnings(
            UUID unitId,
            String unitName,
            long totalDays,
            BigDecimal earnings,
            long reservationCount,
            long reservationsWithoutAmount
    ) {}

    public record Totals(
            long totalDays,
            BigDecimal earnings,
            long reservationCount,
            long reservationsWithoutAmount
    ) {}
}
