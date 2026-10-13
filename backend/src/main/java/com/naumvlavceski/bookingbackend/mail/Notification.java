package com.naumvlavceski.bookingbackend.mail;

import java.time.LocalDate;
import java.util.UUID;

/** Something worth telling an owner about. In memory only: it is emailed and not stored. */
record Notification(
        UUID ownerId,
        String type,
        String place,
        String platform,
        LocalDate startDate,
        LocalDate endDate,
        LocalDate prevStart,
        LocalDate prevEnd,
        String guest,
        String detail
) {}
