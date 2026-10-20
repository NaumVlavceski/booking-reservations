package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.ReservationSource;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PlatformDetectorTest {

    private static Optional<ReservationSource> detect(String url) {
        return PlatformDetector.detect(PlatformDetector.normalize(url));
    }

    @Test
    void bookingComFeedsAreRecognised() {
        assertEquals(Optional.of(ReservationSource.BOOKING), detect("https://ical.booking.com/v1/export?t=abc123"));
        assertEquals(Optional.of(ReservationSource.BOOKING), detect("https://admin.booking.com/x.ics"));
        assertEquals(Optional.of(ReservationSource.BOOKING), detect("HTTPS://ICAL.BOOKING.COM/v1/export?t=abc"));
    }

    @Test
    void airbnbFeedsAreNotSupported() {
        assertEquals(Optional.empty(), detect("https://www.airbnb.com/calendar/ical/123.ics?s=abc"));
        assertEquals(Optional.empty(), detect("https://airbnb.mk/calendar/ical/123.ics"));
    }

    @Test
    void onlyTheHostCounts() {
        // the word in the path or the query must not fool it
        assertEquals(Optional.empty(), detect("https://example.com/booking.com/airbnb.com.ics"));
        assertEquals(Optional.empty(), detect("https://example.com/feed.ics?from=ical.booking.com"));
        // look-alike hosts
        assertEquals(Optional.empty(), detect("https://booking.com.evil.com/a.ics"));
        assertEquals(Optional.empty(), detect("https://evilbooking.com/a.ics"));
    }

    @Test
    void otherAndBrokenLinksAreNotRecognised() {
        assertEquals(Optional.empty(), detect("https://calendar.google.com/calendar/ical/x/basic.ics"));
        assertEquals(Optional.empty(), detect("not a link"));
        assertEquals(Optional.empty(), detect(""));
        assertEquals(Optional.empty(), detect("https://"));
    }

    @Test
    void webcalLinksAreTurnedIntoHttps() {
        assertEquals("https://ical.booking.com/v1/export?t=abc", PlatformDetector.normalize("  webcal://ical.booking.com/v1/export?t=abc  "));
        assertEquals("https://example.com/1.ics", PlatformDetector.normalize("WEBCAL://example.com/1.ics"));
        assertEquals(Optional.of(ReservationSource.BOOKING), detect("webcal://ical.booking.com/v1/export?t=abc"));
    }

    @Test
    void ordinaryLinksAreOnlyTrimmed() {
        assertEquals("https://example.com/a.ics", PlatformDetector.normalize("  https://example.com/a.ics "));
        assertEquals("", PlatformDetector.normalize(null));
    }
}
