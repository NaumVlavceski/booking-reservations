package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ConflictKind;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.SyncConflict;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

public record SyncConflictResponse(
        UUID id,
        UUID unitId,
        String unitName,
        ReservationSource platform,
        LocalDate incomingStart,
        LocalDate incomingEnd,
        String incomingSummary,
        UUID conflictingReservationId,
        ConflictKind kind,
        LocalDateTime createdAt
) {
    public static SyncConflictResponse from(SyncConflict c, String unitName) {
        return new SyncConflictResponse(
                c.getId(),
                c.getUnitId(),
                unitName,
                c.getPlatform(),
                c.getIncomingStart(),
                c.getIncomingEnd(),
                c.getIncomingSummary(),
                c.getConflictingReservationId(),
                c.getKind(),
                c.getCreatedAt()
        );
    }
}
