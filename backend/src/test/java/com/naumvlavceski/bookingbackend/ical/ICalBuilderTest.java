package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;
import io.hypersistence.utils.hibernate.type.range.Range;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class ICalBuilderTest {

    private static Reservation reservation(ReservationStatus status, ReservationSource source) {
        Reservation r = new Reservation();
        r.setId(UUID.randomUUID());
        r.setStayRange(Range.closedOpen(LocalDate.of(2030, 6, 10), LocalDate.of(2030, 6, 15)));
        r.setStatus(status);
        r.setSource(source);
        r.setGuestName("Alice Secret");
        r.setGuestEmail("secret@example.test");
        r.setGuestPhone("555-0100");
        return r;
    }

    private static Unit unit() {
        Unit u = new Unit();
        u.setName("Room 1, sea view");
        return u;
    }

    @Test
    void exportsOnlyActiveDirectReservations() {
        String ics = ICalBuilder.build(unit(), List.of(
                reservation(ReservationStatus.CONFIRMED, ReservationSource.DIRECT),
                reservation(ReservationStatus.CANCELLED, ReservationSource.DIRECT),
                reservation(ReservationStatus.CONFIRMED, ReservationSource.AIRBNB)));
        assertEquals(1, ics.split("BEGIN:VEVENT", -1).length - 1);
        assertTrue(ics.contains("DTSTART;VALUE=DATE:20300610"));
        assertTrue(ics.contains("DTEND;VALUE=DATE:20300615"));
    }

    @Test
    void neverLeaksGuestDetails() {
        String ics = ICalBuilder.build(unit(), List.of(reservation(ReservationStatus.CONFIRMED, ReservationSource.DIRECT)));
        assertTrue(ics.contains("SUMMARY:Reserved"));
        assertFalse(ics.contains("Alice"));
        assertFalse(ics.contains("secret@example.test"));
        assertFalse(ics.contains("555-0100"));
    }

    @Test
    void escapesCalendarNameAndUsesCrlf() {
        String ics = ICalBuilder.build(unit(), List.of());
        assertTrue(ics.contains("X-WR-CALNAME:Room 1\\, sea view\r\n"));
        assertTrue(ics.startsWith("BEGIN:VCALENDAR\r\n"));
        assertTrue(ics.endsWith("END:VCALENDAR\r\n"));
    }

    @Test
    void generatedFeedRoundTripsThroughOurParser() {
        String ics = ICalBuilder.build(unit(), List.of(reservation(ReservationStatus.CONFIRMED, ReservationSource.DIRECT)));
        List<ParsedIcalEvent> parsed = IcalParser.parse(ics);
        assertEquals(1, parsed.size());
        assertTrue(parsed.get(0).uid().endsWith("@staytrack"));
        assertEquals(LocalDate.of(2030, 6, 10), parsed.get(0).startDate());
    }
}
