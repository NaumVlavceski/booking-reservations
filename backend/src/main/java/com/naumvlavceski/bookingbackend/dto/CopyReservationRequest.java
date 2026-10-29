package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record CopyReservationRequest(
        @NotEmpty List<@NotNull UUID> unitIds) {
}
