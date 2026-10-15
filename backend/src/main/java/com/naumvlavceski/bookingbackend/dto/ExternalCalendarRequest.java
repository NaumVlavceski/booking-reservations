package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The channel is not sent: it is worked out from the link (see PlatformDetector). */
public record ExternalCalendarRequest(@NotBlank @Size(max = 1000) String icsUrl) {
}
