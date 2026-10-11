package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.*;
import com.naumvlavceski.bookingbackend.repository.*;
import io.hypersistence.utils.hibernate.type.range.Range;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Runs against the real schema, including the no-overlap constraint. Each test rolls back. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class IcalReconcilerTest {

    @Autowired IcalReconciler reconciler;
    @Autowired OwnerRepository ownerRepository;
    @Autowired PropertyRepository propertyRepository;
    @Autowired UnitRepository unitRepository;
    @Autowired ExternalCalendarRepository calendarRepository;
    @Autowired ReservationRepository reservationRepository;
    @Autowired ExternalEventRepository externalEventRepository;
    @Autowired SyncConflictRepository conflictRepository;

    Unit unit;
    ExternalCalendar calendar;

    @BeforeEach
    void setUp() {
        Owner owner = new Owner();
        owner.setBusinessName("Test owner");
        owner = ownerRepository.save(owner);

        Property property = new Property();
        property.setOwner(owner);
        property.setName("Test property");
        property = propertyRepository.save(property);

        unit = new Unit();
        unit.setOwnerId(owner.getId());
        unit.setProperty(property);
        unit.setName("Room 1");
        unit.setCapacity(2);
        unit = unitRepository.save(unit);

        calendar = new ExternalCalendar();
        calendar.setUnitId(unit.getId());
        calendar.setPlatform(ReservationSource.AIRBNB);
        calendar.setIcsUrl("https://example.com/feed.ics");
        calendar = calendarRepository.save(calendar);
    }

    private static ParsedIcalEvent event(String uid, String start, String end) {
        String raw = "BEGIN:VEVENT\r\nUID:" + uid + "\r\nDTSTART;VALUE=DATE:" + start
                + "\r\nDTEND;VALUE=DATE:" + end + "\r\nEND:VEVENT";
        return new ParsedIcalEvent(uid,
                LocalDate.parse(start, DateTimeFormatter.BASIC_ISO_DATE),
                LocalDate.parse(end, DateTimeFormatter.BASIC_ISO_DATE), "Reserved", raw);
    }

    private Reservation reservationFor(String uid) {
        ExternalEvent ee = externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), uid).orElseThrow();
        return reservationRepository.findById(ee.getReservationId()).orElseThrow();
    }

    private Reservation manualReservation(String from, String to) {
        Reservation r = new Reservation();
        r.setUnit(unit);
        r.setOwnerId(unit.getOwnerId());
        r.setStayRange(Range.closedOpen(LocalDate.parse(from), LocalDate.parse(to)));
        r.setStatus(ReservationStatus.CONFIRMED);
        r.setGuestsCount(2);
        return reservationRepository.save(r);
    }

    @Test
    void newEventCreatesReservationFromThePlatform() {
        reconciler.reconcile(calendar, List.of(event("a1", "20300610", "20300615")));

        Reservation r = reservationFor("a1");
        assertEquals(LocalDate.of(2030, 6, 10), r.getStayRange().lower());
        assertEquals(LocalDate.of(2030, 6, 15), r.getStayRange().upper());
        assertEquals(ReservationSource.AIRBNB, r.getSource());
        assertEquals(ReservationStatus.CONFIRMED, r.getStatus());
    }

    @Test
    void syncingTheSameFeedTwiceIsIdempotent() {
        List<ParsedIcalEvent> feed = List.of(event("a1", "20300610", "20300615"));
        reconciler.reconcile(calendar, feed);
        reconciler.reconcile(calendar, feed);
        assertEquals(1, reservationRepository.findAllByUnitIdAndStatusNot(unit.getId(), ReservationStatus.CANCELLED).size());
        assertEquals(1, externalEventRepository.findAllByExternalCalendarId(calendar.getId()).size());
    }

    @Test
    void changedDatesUpdateTheReservation() {
        reconciler.reconcile(calendar, List.of(event("a1", "20300610", "20300615")));
        reconciler.reconcile(calendar, List.of(event("a1", "20300611", "20300617")));

        Reservation r = reservationFor("a1");
        assertEquals(LocalDate.of(2030, 6, 11), r.getStayRange().lower());
        assertEquals(LocalDate.of(2030, 6, 17), r.getStayRange().upper());
    }

    @Test
    void eventRemovedFromFeedCancelsTheReservation() {
        reconciler.reconcile(calendar, List.of(event("a1", "20300610", "20300615")));
        reconciler.reconcile(calendar, List.of());
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());
    }

    @Test
    void eventReturningToFeedRevivesTheReservation() {
        List<ParsedIcalEvent> feed = List.of(event("a1", "20300610", "20300615"));
        reconciler.reconcile(calendar, feed);
        reconciler.reconcile(calendar, List.of());
        reconciler.reconcile(calendar, feed);
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
    }

    @Test
    void overlapWithADirectBookingRecordsAConflictAndCreatesNothing() {
        Reservation direct = manualReservation("2030-06-12", "2030-06-14");

        reconciler.reconcile(calendar, List.of(event("a1", "20300610", "20300615")));

        assertTrue(externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), "a1").isEmpty());
        SyncConflict conflict = conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow();
        assertEquals(ConflictStatus.OPEN, conflict.getStatus());
        assertEquals(ConflictKind.NEW_OVERLAP, conflict.getKind());
        assertEquals(direct.getId(), conflict.getConflictingReservationId());
    }

    @Test
    void conflictIsResolvedOnceTheCollisionDisappears() {
        Reservation direct = manualReservation("2030-06-12", "2030-06-14");
        List<ParsedIcalEvent> feed = List.of(event("a1", "20300610", "20300615"));
        reconciler.reconcile(calendar, feed);

        direct.setStatus(ReservationStatus.CANCELLED);
        reservationRepository.save(direct);
        reconciler.reconcile(calendar, feed);

        assertEquals(ConflictStatus.RESOLVED,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow().getStatus());
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
    }

    @Test
    void conflictIsResolvedWhenTheEventVanishesFromTheFeed() {
        manualReservation("2030-06-12", "2030-06-14");
        reconciler.reconcile(calendar, List.of(event("a1", "20300610", "20300615")));
        reconciler.reconcile(calendar, List.of());
        assertEquals(ConflictStatus.RESOLVED,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow().getStatus());
    }

    @Test
    void moveIntoAnotherBookingKeepsOldDatesAndFlagsConflict() {
        manualReservation("2030-07-01", "2030-07-05");
        reconciler.reconcile(calendar, List.of(event("a1", "20300610", "20300615")));
        reconciler.reconcile(calendar, List.of(event("a1", "20300630", "20300703")));

        Reservation r = reservationFor("a1");
        assertEquals(LocalDate.of(2030, 6, 10), r.getStayRange().lower());
        assertEquals(ConflictKind.CHANGE_OVERLAP,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow().getKind());
    }

    @Test
    void backToBackStaysAreNotConflicts() {
        manualReservation("2030-06-05", "2030-06-10");
        reconciler.reconcile(calendar, List.of(event("a1", "20300610", "20300615")));
        assertNotNull(reservationFor("a1"));
        assertTrue(conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").isEmpty());
    }

    @Test
    void ourOwnExportedEventsEchoedBackAreIgnored() {
        reconciler.reconcile(calendar, List.of(event(UUID.randomUUID() + "@staytrack", "20300610", "20300615")));
        assertTrue(externalEventRepository.findAllByExternalCalendarId(calendar.getId()).isEmpty());
        assertTrue(reservationRepository.findAllByUnitIdAndStatusNot(unit.getId(), ReservationStatus.CANCELLED).isEmpty());
    }
}
