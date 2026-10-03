package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ReservationSource;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;

public record ExternalCalendarResponse(
        UUID id,
        UUID unitId,
        String unitName,
        ReservationSource platform,
        Instant lastSyncedAt,
        Instant lastSuccessAt,
        String lastError,
        int consecutiveFailures
) {
    public static ExternalCalendarResponse from(ExternalCalendar c, String unitName) {
        return new ExternalCalendarResponse(
                c.getId(),
                c.getUnitId(),
                unitName,
                c.getPlatform(),
                c.getLastSyncedAt(),
                c.getLastSuccessAt(),
                c.getLastError(),
                c.getConsecutiveFailures()
        );
    }
}
