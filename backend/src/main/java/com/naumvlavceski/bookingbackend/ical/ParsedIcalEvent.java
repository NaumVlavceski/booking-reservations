package com.naumvlavceski.bookingbackend.ical;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record ParsedIcalEvent(
        String uid,
        LocalDate startDate,
        LocalDate endDate,
        String summary,
        String rawBlock
) {
}
