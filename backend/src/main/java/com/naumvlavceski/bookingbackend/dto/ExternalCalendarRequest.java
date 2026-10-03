package com.naumvlavceski.bookingbackend.dto;

import com.naumvlavceski.bookingbackend.model.ReservationSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ExternalCalendarRequest(
        @NotNull ReservationSource platform,
        @NotBlank @Size(max = 1000) String icsUrl) {
}
