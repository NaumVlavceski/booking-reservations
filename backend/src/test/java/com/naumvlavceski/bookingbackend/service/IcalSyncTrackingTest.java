package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.ical.IcalFetchException;
import com.naumvlavceski.bookingbackend.ical.IcalFetchGuard;
import com.naumvlavceski.bookingbackend.ical.IcalReconciler;
import com.naumvlavceski.bookingbackend.mail.ReservationNotifier;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** A3: a failed sync records when and why for support, and the stored reason never contains the calendar's link. */
class IcalSyncTrackingTest {

    private static final String URL = "https://ical.booking.com/v1/export?t=0f3c9a1e-7b2d-4c5e-9a8b-112233445566";

    @Test
    void failureRecordsTimeCountAndASafeMessage() {
        ExternalCalendarRepository calendars = mock(ExternalCalendarRepository.class);
        IcalFetchGuard guard = mock(IcalFetchGuard.class);
        ExternalCalendar c = new ExternalCalendar();
        c.setId(UUID.randomUUID());
        c.setUnitId(UUID.randomUUID());
        c.setPlatform(ReservationSource.BOOKING);
        c.setIcsUrl(URL);
        when(calendars.findById(c.getId())).thenReturn(Optional.of(c));
        doThrow(new IcalFetchException("Failed after 3 attempts: GET " + URL + " -> connect timed out"))
                .when(guard).check(anyString());

        IcalSyncService service = new IcalSyncService(calendars, mock(IcalReconciler.class), guard,
                mock(UnitRepository.class), mock(ReservationNotifier.class));
        Instant before = Instant.now();
        service.sync(c.getId());
        service.sync(c.getId());

        assertEquals(2, c.getConsecutiveFailures());
        assertNotNull(c.getLastErrorAt());
        assertFalse(c.getLastErrorAt().isBefore(before));
        assertEquals(c.getLastSyncedAt(), c.getLastErrorAt(), "last attempt = this failure");
        String message = c.getLastErrorMessage();
        assertTrue(message.startsWith("Failed after 3 attempts"), message);
        assertFalse(message.contains("ical.booking.com"), message);
        assertFalse(message.contains("0f3c9a1e"), message);
        assertTrue(message.length() <= 300);
    }
}
