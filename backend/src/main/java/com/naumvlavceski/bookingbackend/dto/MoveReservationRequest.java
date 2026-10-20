package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record MoveReservationRequest(@NotNull UUID unitId) {
}
