package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ReservationSource;

import java.time.LocalDateTime;
import java.util.UUID;

public record ExternalCalendarResponse(
        UUID id,
        UUID unitId,
        ReservationSource platform,
        LocalDateTime lastSyncedAt,
        LocalDateTime lastSuccessAt,
        String lastError
) {
    public static ExternalCalendarResponse from(ExternalCalendar c) {
        return new ExternalCalendarResponse(c.getId(),
                c.getUnitId(),
                c.getPlatform(),
                c.getLastSyncedAt(),
                c.getLastSuccessAt(),
                c.getLastError()
        );
    }
}
