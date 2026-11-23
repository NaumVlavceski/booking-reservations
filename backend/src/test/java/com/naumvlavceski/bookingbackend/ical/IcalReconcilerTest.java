package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.*;
import com.naumvlavceski.bookingbackend.repository.*;
import io.hypersistence.utils.hibernate.type.range.Range;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.naumvlavceski.bookingbackend.dto.ReservationRequest;
import com.naumvlavceski.bookingbackend.exception.ChannelBookingException;
import com.naumvlavceski.bookingbackend.mail.ReservationNotifier;
import com.naumvlavceski.bookingbackend.service.ReservationService;
import java.math.BigDecimal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Runs against the real schema, including the no-overlap constraint. Each test rolls back. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class IcalReconcilerTest {

    @MockitoBean ReservationNotifier notifier;
    @Autowired ReservationService reservationService;
    @Autowired IcalReconciler reconciler;
    @Autowired OwnerRepository ownerRepository;
    @Autowired PropertyRepository propertyRepository;
    @Autowired UnitRepository unitRepository;
    @Autowired ExternalCalendarRepository calendarRepository;
    @Autowired ReservationRepository reservationRepository;
    @Autowired ExternalEventRepository externalEventRepository;
    @Autowired SyncConflictRepository conflictRepository;
    @Autowired EntityManager entityManager;

    Unit unit;
    ExternalCalendar calendar;

    @BeforeEach
    void setUp() {
        Owner owner = new Owner();
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

    private void reconcile(List<ParsedIcalEvent> events) {
        reconciler.reconcile(calendar, ParseResult.complete(events));
    }

    /** Makes the event look as if it first went missing this long ago, and enough syncs ago. */
    private void missingFor(String uid, Duration howLong) {
        ExternalEvent e = externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), uid).orElseThrow();
        e.setMissingSince(Instant.now().minus(howLong));
        e.setMissingSyncs(3);
        externalEventRepository.save(e);
    }

    private Unit secondRoom() {
        Unit room = new Unit();
        room.setOwnerId(unit.getOwnerId());
        room.setProperty(unit.getProperty());
        room.setName("Room 2");
        room.setCapacity(2);
        return unitRepository.save(room);
    }

    private Reservation directIn(Unit room, String from, String to) {
        Reservation r = manualReservation(from, to);
        r.setUnit(room);
        return reservationRepository.save(r);
    }

    private void moveToRoom(String uid, Unit room) {
        Reservation r = reservationFor(uid);
        r.setUnit(room);
        reservationRepository.saveAndFlush(r);
    }

    /** What disconnecting and connecting the same calendar again does: the bookings stay, the event links go. */
    private void reconnectCalendar() {
        calendarRepository.delete(calendar);
        calendarRepository.flush();
        entityManager.clear();
        calendar = new ExternalCalendar();
        calendar.setUnitId(unit.getId());
        calendar.setPlatform(ReservationSource.AIRBNB);
        calendar.setIcsUrl("https://example.com/new-link.ics");
        calendar = calendarRepository.save(calendar);
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
        reconcile(List.of(event("a1", "20300610", "20300615")));

        Reservation r = reservationFor("a1");
        assertEquals(LocalDate.of(2030, 6, 10), r.getStayRange().lower());
        assertEquals(LocalDate.of(2030, 6, 15), r.getStayRange().upper());
        assertEquals(ReservationSource.AIRBNB, r.getSource());
        assertEquals(ReservationStatus.CONFIRMED, r.getStatus());
    }

    @Test
    void syncingTheSameFeedTwiceIsIdempotent() {
        List<ParsedIcalEvent> feed = List.of(event("a1", "20300610", "20300615"));
        reconcile(feed);
        reconcile(feed);
        assertEquals(1, reservationRepository.findAllByUnitIdAndStatusNot(unit.getId(), ReservationStatus.CANCELLED).size());
        assertEquals(1, externalEventRepository.findAllByExternalCalendarId(calendar.getId()).size());
    }

    @Test
    void changedDatesUpdateTheReservation() {
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of(event("a1", "20300611", "20300617")));

        Reservation r = reservationFor("a1");
        assertEquals(LocalDate.of(2030, 6, 11), r.getStayRange().lower());
        assertEquals(LocalDate.of(2030, 6, 17), r.getStayRange().upper());
    }

    private void setPrice(Reservation r, String total) {
        r.setTotalAmount(new BigDecimal(total));
        reservationRepository.save(r);
    }

    @Test
    void changedDatesKeepThePriceButFlagItForReviewAndRemindInTheEmail() {
        reconcile(List.of(event("a1", "20300610", "20300613")));
        setPrice(reservationFor("a1"), "50.00");

        reconcile(List.of(event("a1", "20300610", "20300616")));

        Reservation r = reservationFor("a1");
        assertEquals(0, new BigDecimal("50").compareTo(r.getTotalAmount()), "price must not be recalculated");
        assertTrue(r.isPriceNeedsReview());
        verify(notifier).externalReservationModified(any(), eq(ReservationSource.AIRBNB),
                eq(LocalDate.of(2030, 6, 10)), eq(LocalDate.of(2030, 6, 13)),
                eq(LocalDate.of(2030, 6, 10)), eq(LocalDate.of(2030, 6, 16)), any(),
                argThat(p -> p != null && p.compareTo(new BigDecimal("50")) == 0));
    }

    @Test
    void changedDatesWithoutAPriceDoNotFlagAnything() {
        reconcile(List.of(event("a1", "20300610", "20300613")));
        reconcile(List.of(event("a1", "20300610", "20300616")));

        assertFalse(reservationFor("a1").isPriceNeedsReview(), "already shown as a red 0");
        verify(notifier).externalReservationModified(any(), any(), any(), any(), any(), any(), any(), isNull());
    }

    @Test
    void aFeedUpdateThatKeepsTheSameDatesDoesNotFlagThePrice() {
        reconcile(List.of(event("a1", "20300610", "20300613")));
        setPrice(reservationFor("a1"), "50");
        // Same dates, different raw block (e.g. a changed description): hash differs, dates do not
        ParsedIcalEvent sameDatesNewBlock = new ParsedIcalEvent("a1", LocalDate.of(2030, 6, 10), LocalDate.of(2030, 6, 13),
                "Reserved", "BEGIN:VEVENT\r\nUID:a1\r\nDESCRIPTION:changed\r\nEND:VEVENT");
        reconcile(List.of(sameDatesNewBlock));

        assertFalse(reservationFor("a1").isPriceNeedsReview());
    }

    @Test
    void savingTheBookingClearsTheReviewFlag() {
        reconcile(List.of(event("a1", "20300610", "20300613")));
        Reservation r = reservationFor("a1");
        setPrice(r, "50");
        reconcile(List.of(event("a1", "20300610", "20300616")));
        assertTrue(reservationFor("a1").isPriceNeedsReview());

        reservationService.update(unit.getOwnerId(), r.getId(), new ReservationRequest(unit.getId(),
                LocalDate.of(2030, 6, 10), LocalDate.of(2030, 6, 16), ReservationStatus.CONFIRMED,
                null, null, new BigDecimal("100"), "Guest", null, null, 2, null));

        Reservation saved = reservationFor("a1");
        assertFalse(saved.isPriceNeedsReview());
        assertEquals(0, new BigDecimal("100").compareTo(saved.getTotalAmount()));
    }

    // Owner's decision (2026-11-14): the first sync that misses a booking only flags it and asks for a quick re-check;
    // the second one cancels it.
    @Test
    void anEventMissingFromOneSyncIsOnlyFlaggedAndRecheckedSoon() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300610", "20300615"), stays));
        assertFalse(calendar.isRecheckSoon());

        reconcile(List.of(stays));

        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus(), "one read is not enough");
        ExternalEvent e = externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), "a1").orElseThrow();
        assertEquals(1, e.getMissingSyncs());
        assertTrue(calendar.isRecheckSoon());
        verify(notifier, never()).externalReservationCancelled(any(), any(), any(), any(), any());
    }

    @Test
    void anEventStillMissingFromTheNextSyncIsCancelledWithoutWaitingAnHour() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300610", "20300615"), stays));

        reconcile(List.of(stays));
        reconcile(List.of(stays));

        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());
        assertNotNull(reservationFor("a1").getCancelledAt(), "the cancelled list sorts by this");
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("stays").getStatus());
        assertFalse(calendar.isRecheckSoon(), "nothing left to confirm");
        verify(notifier, times(1)).externalReservationCancelled(any(), any(), any(), any(), any());
    }

    @Test
    void theFlagShowsOnTheBookingUntilTheEventIsBack() {
        ParsedIcalEvent a1 = event("a1", "20300610", "20300615");
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(a1, stays));
        UUID id = reservationFor("a1").getId();

        reconcile(List.of(stays));
        assertTrue(reservationService.findOneForOwner(unit.getOwnerId(), id).missingFromFeed());
        assertFalse(reservationService.findOneForOwner(unit.getOwnerId(), reservationFor("stays").getId())
                .missingFromFeed());

        reconcile(List.of(a1, stays));
        assertFalse(reservationService.findOneForOwner(unit.getOwnerId(), id).missingFromFeed());
        assertFalse(calendar.isRecheckSoon());
    }

    // Seen on Booking.com (2026-11-14): an event left the feed, the sync cancelled its booking, and later the same UID
    // came back for a new booking with other dates (and DTSTAMP changes on every download anyway). It used to stay
    // cancelled for good: only a byte-identical event was restored, and the next sync took it for the owner's cancel.
    @Test
    void aBookingTheSyncCancelledComesBackWhenItsEventReturnsChanged() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300618", "20300629"), stays));
        reconcile(List.of(stays));
        reconcile(List.of(stays));
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());

        reconcile(List.of(event("a1", "20300618", "20300620"), stays));

        Reservation back = reservationFor("a1");
        assertEquals(ReservationStatus.CONFIRMED, back.getStatus());
        assertEquals(LocalDate.of(2030, 6, 18), back.getStayRange().lower());
        assertEquals(LocalDate.of(2030, 6, 20), back.getStayRange().upper());
        verify(notifier, never()).externalReservationModified(any(), any(), any(), any(), any(), any(), any(), any());

        reconcile(List.of(event("a1", "20300618", "20300620"), stays));
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus(), "and stays back");
    }

    @Test
    void aBookingTheSyncCancelledWhoseDatesAreTakenComesBackOnceTheyAreFree() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300618", "20300629"), stays));
        reconcile(List.of(stays));
        reconcile(List.of(stays));
        // Each sync commits on its own in the app; here everything is one transaction, and Hibernate would write the
        // new booking before a1's cancellation, which the no-overlap constraint refuses
        entityManager.flush();
        Reservation direct = directIn(unit, "2030-06-19", "2030-06-21");

        reconcile(List.of(event("a1", "20300618", "20300620"), stays));
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus(), "the dates are taken");
        reconcile(List.of(event("a1", "20300618", "20300620"), stays));
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());

        reservationService.delete(unit.getOwnerId(), direct.getId());
        reconcile(List.of(event("a1", "20300618", "20300620"), stays));
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus(), "still known as cancelled by the sync");
    }

    // Owner's decision (2026-11-14, ICAL-01 revisited): a cancelled booking its channel lists comes back, whoever
    // cancelled it; while the channel lists it, the owner can't cancel it in the app at all.
    @Test
    void aBookingCancelledInTheAppWhileMarkedMissingComesBackWhenListedAgain() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300618", "20300629"), stays));
        reconcile(List.of(stays)); // marked missing: the owner may cancel it now
        reservationService.delete(unit.getOwnerId(), reservationFor("a1").getId());
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());

        reconcile(List.of(event("a1", "20300618", "20300620"), stays));

        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus(), "the guest holds the dates");
    }

    @Test
    void aBookingTheChannelStillListsCanNotBeCancelledInTheApp() {
        reconcile(List.of(event("a1", "20300610", "20300615")));
        UUID id = reservationFor("a1").getId();
        assertTrue(reservationService.findOneForOwner(unit.getOwnerId(), id).listedByChannel());

        assertThrows(ChannelBookingException.class, () -> reservationService.delete(unit.getOwnerId(), id));
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
    }

    @Test
    void aBookingNoCalendarSyncsAnyMoreCanBeCancelledInTheApp() {
        reconcile(List.of(event("a1", "20300610", "20300615")));
        UUID id = reservationFor("a1").getId();
        externalEventRepository.unlinkReservation(id); // what disconnecting the calendar leaves behind

        assertFalse(reservationService.findOneForOwner(unit.getOwnerId(), id).listedByChannel());
        reservationService.delete(unit.getOwnerId(), id);
        assertEquals(ReservationStatus.CANCELLED, reservationRepository.findById(id).orElseThrow().getStatus());
    }

    @Test
    void aCancelledBookingStillListedComesBackAtTheNextSync() {
        // e.g. cancelled in the app before that was refused
        ParsedIcalEvent a1 = event("a1", "20300610", "20300615");
        reconcile(List.of(a1));
        Reservation r = reservationFor("a1");
        r.setStatus(ReservationStatus.CANCELLED);
        reservationRepository.save(r);

        reconcile(List.of(a1));

        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
    }

    // Owner's decision (2026-11-14): Booking.com gives a booking a new UID when its check-in day changes. One booking
    // gone plus one new event overlapping it, in the same read, is the same booking with new dates.
    @Test
    void aCheckInMovedEarlierKeepsTheBookingAndItsDetails() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("old-uid", "20300617", "20300620"), stays));
        Reservation booking = reservationFor("old-uid");
        booking.setTotalAmount(new BigDecimal("300"));
        booking.setNotes("Late arrival");
        booking.setGuestName("Ana");
        reservationRepository.save(booking);

        reconcile(List.of(event("new-uid", "20300616", "20300619"), stays));

        Reservation moved = reservationFor("new-uid");
        assertEquals(booking.getId(), moved.getId(), "the same booking, not a new one");
        assertEquals(ReservationStatus.CONFIRMED, moved.getStatus());
        assertEquals(LocalDate.of(2030, 6, 16), moved.getStayRange().lower());
        assertEquals(LocalDate.of(2030, 6, 19), moved.getStayRange().upper());
        assertEquals("Late arrival", moved.getNotes());
        assertEquals("Ana", moved.getGuestName());
        assertTrue(moved.isPriceNeedsReview());
        assertTrue(externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), "old-uid").isEmpty());
        assertEquals(2, reservationRepository.findAllByUnitIdAndOwnerId(unit.getId(), unit.getOwnerId()).size());
        assertTrue(conflictRepository.findAllByExternalCalendarIdAndStatus(calendar.getId(), ConflictStatus.OPEN).isEmpty());
        assertFalse(calendar.isRecheckSoon(), "nothing is waiting to be cancelled");
        verify(notifier, times(1)).externalReservationModified(any(), any(), eq(LocalDate.of(2030, 6, 17)),
                eq(LocalDate.of(2030, 6, 20)), eq(LocalDate.of(2030, 6, 16)), eq(LocalDate.of(2030, 6, 19)),
                any(), eq(new BigDecimal("300")));
        verify(notifier, never()).externalReservationCancelled(any(), any(), any(), any(), any());
        verify(notifier, never()).bookingConflict(any(), any(), anyBoolean(), any(), any(), any(), any(), any(), any(), any());

        reconcile(List.of(event("new-uid", "20300616", "20300619"), stays));
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("new-uid").getStatus(), "and it stays");
    }

    @Test
    void aMoveToDatesThatDoNotOverlapIsACancellationAndANewBooking() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("old-uid", "20300616", "20300618"), stays));
        UUID old = reservationFor("old-uid").getId();

        reconcile(List.of(event("new-uid", "20300625", "20300628"), stays));
        assertNotEquals(old, reservationFor("new-uid").getId(), "a new booking");
        assertEquals(ReservationStatus.CONFIRMED, reservationRepository.findById(old).orElseThrow().getStatus(),
                "the old one only marked missing so far");

        reconcile(List.of(event("new-uid", "20300625", "20300628"), stays));
        assertEquals(ReservationStatus.CANCELLED, reservationRepository.findById(old).orElseThrow().getStatus());
    }

    @Test
    void twoBookingsGoneAtOnceIsNotAClearMatch() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300617", "20300620"), event("a2", "20300701", "20300705"), stays));
        UUID a1 = reservationFor("a1").getId();

        reconcile(List.of(event("new-uid", "20300616", "20300619"), stays));

        assertTrue(externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), "new-uid").isEmpty(),
                "not linked to a1; it overlaps a1, still live, so it waits as a conflict");
        assertEquals(1, conflictRepository.findAllByExternalCalendarIdAndStatus(calendar.getId(), ConflictStatus.OPEN).size());
        assertEquals(ReservationStatus.CONFIRMED, reservationRepository.findById(a1).orElseThrow().getStatus());
    }

    @Test
    void aMovedCheckInOntoAnotherBookingIsStillAConflict() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("old-uid", "20300617", "20300620"), stays));
        directIn(unit, "2030-06-14", "2030-06-17");

        reconcile(List.of(event("new-uid", "20300615", "20300619"), stays));

        assertTrue(externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), "old-uid").isPresent());
        assertEquals(1, conflictRepository.findAllByExternalCalendarIdAndStatus(calendar.getId(), ConflictStatus.OPEN).size());
    }

    // Owner's decision (2026-11-14): a cancelled channel booking its channel no longer lists would be cancelled again by
    // the next sync if restored as is; the app offers to restore it as Direct, which the sync then leaves alone.
    @Test
    void aBookingBookingComDroppedIsFlaggedAndCanBeRestoredAsDirect() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300610", "20300615"), stays));
        reconcile(List.of(stays));
        reconcile(List.of(stays));
        Reservation gone = reservationFor("a1");
        assertEquals(ReservationStatus.CANCELLED, gone.getStatus());
        lastSuccessfulSyncWas(Instant.now()); // the read that no longer had it

        assertTrue(reservationService.findOneForOwner(unit.getOwnerId(), gone.getId()).missingFromFeed());

        reservationService.update(unit.getOwnerId(), gone.getId(), restore(gone, true));
        entityManager.clear();

        Reservation restored = reservationRepository.findById(gone.getId()).orElseThrow();
        assertEquals(ReservationStatus.CONFIRMED, restored.getStatus());
        assertEquals(ReservationSource.DIRECT, restored.getSource());
        assertFalse(externalEventRepository.existsByReservationId(gone.getId()), "the sync no longer knows it");

        reconcile(List.of(stays));
        reconcile(List.of(stays));
        assertEquals(ReservationStatus.CONFIRMED, reservationRepository.findById(gone.getId()).orElseThrow().getStatus(),
                "not cancelled again");
    }

    @Test
    void aCancelledBookingTheFeedStillListsIsNotFlagged() {
        lastSuccessfulSyncWas(Instant.now().minusSeconds(1));
        reconcile(List.of(event("a1", "20300610", "20300615")));
        Reservation r = reservationFor("a1");
        r.setStatus(ReservationStatus.CANCELLED); // the next sync would bring it back anyway
        reservationRepository.save(r);

        assertFalse(reservationService.findOneForOwner(unit.getOwnerId(), r.getId()).missingFromFeed(),
                "restoring it as a Booking.com booking is fine: the feed still has it");
    }

    @Test
    void restoringAsIsWithoutAsDirectKeepsTheChannel() {
        ParsedIcalEvent stays = event("stays", "20300801", "20300805");
        reconcile(List.of(event("a1", "20300610", "20300615"), stays));
        reconcile(List.of(stays)); // marked missing, so the owner may cancel it
        Reservation booking = reservationFor("a1");
        reservationService.delete(unit.getOwnerId(), booking.getId());

        reservationService.update(unit.getOwnerId(), booking.getId(), restore(booking, false));

        assertEquals(ReservationSource.AIRBNB, reservationRepository.findById(booking.getId()).orElseThrow().getSource());
        assertTrue(externalEventRepository.existsByReservationId(booking.getId()));
    }

    private void lastSuccessfulSyncWas(Instant when) {
        calendar.setLastSuccessAt(when);
        calendar = calendarRepository.save(calendar);
    }

    private static ReservationRequest restore(Reservation r, boolean asDirect) {
        return new ReservationRequest(r.getUnit().getId(), r.getStayRange().lower(), r.getStayRange().upper(),
                ReservationStatus.CONFIRMED, null, null, null, "", null, null, 2, null, asDirect);
    }

    @Test
    void anEmptyFeedDoesNotAskForAQuickRecheck() {
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of());
        assertFalse(calendar.isRecheckSoon(), "an empty feed waits hours anyway");
    }

    @Test
    void oneEmptyFeedCancelsNothingAndTellsNobody() {
        reconcile(List.of(event("a1", "20300610", "20300615"), event("a2", "20300701", "20300705")));
        reconcile(List.of());

        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a2").getStatus());
        verify(notifier, never()).externalReservationCancelled(any(), any(), any(), any(), any());
    }

    @Test
    void aFeedThatStaysEmptyWaitsLongerBeforeCancelling() {
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of());

        missingFor("a1", Duration.ofHours(5));
        reconcile(List.of());
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus(), "under 6 hours: still booked");

        missingFor("a1", Duration.ofHours(7));
        reconcile(List.of());
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());
    }

    @Test
    void anEventThatComesBackStartsTheCountAgain() {
        ParsedIcalEvent a1 = event("a1", "20300610", "20300615");
        reconcile(List.of(a1));
        reconcile(List.of());
        reconcile(List.of(a1));

        ExternalEvent e = externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), "a1").orElseThrow();
        assertNull(e.getMissingSince());
        assertEquals(0, e.getMissingSyncs());
    }

    @Test
    void eventReturningToFeedRevivesTheReservation() {
        List<ParsedIcalEvent> feed = List.of(event("a1", "20300610", "20300615"));
        reconcile(feed);
        reconcile(List.of());
        missingFor("a1", Duration.ofHours(7));
        reconcile(List.of());
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());

        reconcile(feed);
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
        assertNull(reservationFor("a1").getCancelledAt(), "a restored booking is no longer cancelled");
    }

    @Test
    void aPartialReadCountsNothingAsMissing() {
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of());
        missingFor("a1", Duration.ofHours(7));

        reconciler.reconcile(calendar, new ParseResult(List.of(), Set.of(), 1));

        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
    }

    @Test
    void aPartialReadStillImportsWhatItCouldRead() {
        reconciler.reconcile(calendar, new ParseResult(List.of(event("a1", "20300610", "20300615")), Set.of(), 1));
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
    }

    @Test
    void anEventWeCouldNotUseIsStillInTheFeedButOthersCanGo() {
        ParsedIcalEvent stays = event("stays", "20300901", "20300905");
        reconcile(List.of(event("bad-now", "20300610", "20300615"), event("gone", "20300701", "20300705"), stays));
        reconcile(List.of(stays));
        missingFor("bad-now", Duration.ofHours(7));
        missingFor("gone", Duration.ofHours(7));

        reconciler.reconcile(calendar, new ParseResult(List.of(stays), Set.of("bad-now"), 0));

        assertEquals(ReservationStatus.CONFIRMED, reservationFor("bad-now").getStatus());
        assertEquals(ReservationStatus.CANCELLED, reservationFor("gone").getStatus());
    }

    @Test
    void aStayThatHasEndedKeepsItsStatusAndMoneyWhenTheFeedDropsIt() {
        reconcile(List.of(event("past", "20200610", "20200615")));
        Reservation past = reservationFor("past");
        past.setStatus(ReservationStatus.PAID);
        setPrice(past, "300");

        for (int sync = 0; sync < 5; sync++) reconcile(List.of());
        missingFor("past", Duration.ofDays(30));
        reconcile(List.of());

        assertEquals(ReservationStatus.PAID, reservationFor("past").getStatus());
        assertEquals(0, new BigDecimal("300").compareTo(reservationFor("past").getTotalAmount()));
        verify(notifier, never()).externalReservationCancelled(any(), any(), any(), any(), any());
    }

    @Test
    void aStayInProgressCanStillBeCancelled() {
        LocalDate today = LocalDate.now();
        reconcile(List.of(event("now", today.minusDays(2).format(DateTimeFormatter.BASIC_ISO_DATE),
                today.plusDays(2).format(DateTimeFormatter.BASIC_ISO_DATE))));
        reconcile(List.of());
        missingFor("now", Duration.ofHours(7));
        reconcile(List.of());
        assertEquals(ReservationStatus.CANCELLED, reservationFor("now").getStatus());
    }

    @Test
    void aDateChangeOfAMovedBookingCollidingInItsNewRoomIsAConflictNotAFailedSync() {
        Unit roomB = secondRoom();
        reconcile(List.of(event("moved", "20300301", "20300305")));
        moveToRoom("moved", roomB);
        directIn(roomB, "2030-03-10", "2030-03-15");

        reconcile(List.of(event("moved", "20300311", "20300314"), event("brand-new", "20300401", "20300405")));

        Reservation moved = reservationFor("moved");
        assertEquals(LocalDate.of(2030, 3, 1), moved.getStayRange().lower(), "the booking keeps its dates");
        assertEquals(roomB.getId(), moved.getUnit().getId());
        SyncConflict conflict = conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "moved").orElseThrow();
        assertEquals(ConflictKind.CHANGE_OVERLAP, conflict.getKind());
        assertEquals(roomB.getId(), conflict.getUnitId());
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("brand-new").getStatus(), "the rest of the feed still comes in");
    }

    @Test
    void aDateChangeOfAMovedBookingIgnoresWhatIsInItsOldRoom() {
        Unit roomB = secondRoom();
        reconcile(List.of(event("moved", "20300301", "20300305")));
        moveToRoom("moved", roomB);
        manualReservation("2030-03-10", "2030-03-15"); // in the calendar's own room, not where the booking is now

        reconcile(List.of(event("moved", "20300311", "20300314")));

        assertEquals(LocalDate.of(2030, 3, 11), reservationFor("moved").getStayRange().lower());
        assertTrue(conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "moved").isEmpty());
    }

    @Test
    void reconnectingACalendarMatchesItsBookingsBackUp() {
        ParsedIcalEvent a1 = event("a1", "20300610", "20300615");
        reconcile(List.of(a1));
        setPrice(reservationFor("a1"), "250");
        UUID bookingId = reservationFor("a1").getId();

        reconnectCalendar();
        reconcile(List.of(a1));

        assertTrue(conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").isEmpty());
        assertEquals(bookingId, reservationFor("a1").getId(), "the same booking, with its price");
        assertEquals(0, new BigDecimal("250").compareTo(reservationFor("a1").getTotalAmount()));
        verify(notifier, never()).bookingConflict(any(), any(), anyBoolean(), any(), any(), any(), any(), any(), any(), any());

        // And it is tracked again: a cancellation on the platform reaches it
        reconcile(List.of());
        missingFor("a1", Duration.ofHours(7));
        reconcile(List.of());
        assertEquals(ReservationStatus.CANCELLED, reservationFor("a1").getStatus());
    }

    @Test
    void aBookingOfAnotherSourceOnTheSameDatesIsStillAConflict() {
        manualReservation("2030-06-10", "2030-06-15");
        reconcile(List.of(event("a1", "20300610", "20300615")));
        assertEquals(ConflictStatus.OPEN,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow().getStatus());
    }

    @Test
    void aBookingStillLinkedToAnotherEventIsNotTakenOver() {
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of(event("a1", "20300610", "20300615"), event("a2", "20300610", "20300615")));
        assertEquals(ConflictStatus.OPEN,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a2").orElseThrow().getStatus());
    }

    @Test
    void theDatabaseRefusesAStayWithNoNights() {
        assertThrows(DataIntegrityViolationException.class, () -> {
            manualReservation("2030-06-10", "2030-06-10");
            reservationRepository.flush();
        });
    }

    @Test
    void overlapWithADirectBookingRecordsAConflictAndCreatesNothing() {
        Reservation direct = manualReservation("2030-06-12", "2030-06-14");

        reconcile(List.of(event("a1", "20300610", "20300615")));

        assertTrue(externalEventRepository.findByExternalCalendarIdAndUid(calendar.getId(), "a1").isEmpty());
        SyncConflict conflict = conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow();
        assertEquals(ConflictStatus.OPEN, conflict.getStatus());
        assertEquals(ConflictKind.NEW_OVERLAP, conflict.getKind());
        assertEquals(direct.getId(), conflict.getConflictingReservationId());
    }

    @Test
    void aNewConflictEmailsTheOwnerOnceAndRepeatedSyncsStaySilent() {
        manualReservation("2030-06-12", "2030-06-14");
        List<ParsedIcalEvent> feed = List.of(event("a1", "20300610", "20300615"));

        reconcile(feed);
        reconcile(feed);
        reconcile(feed);

        verify(notifier, times(1)).bookingConflict(any(), eq(ReservationSource.AIRBNB), eq(false),
                eq(LocalDate.of(2030, 6, 10)), eq(LocalDate.of(2030, 6, 15)), any(),
                any(), eq(LocalDate.of(2030, 6, 12)), eq(LocalDate.of(2030, 6, 14)), any());
    }

    @Test
    void aConflictThatChangesIsReportedAgain() {
        manualReservation("2030-06-12", "2030-06-14");
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of(event("a1", "20300611", "20300616")));

        verify(notifier, times(2)).bookingConflict(any(), any(), anyBoolean(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void aConflictInThePastSendsNoEmail() {
        manualReservation("2020-06-12", "2020-06-14");
        reconcile(List.of(event("a1", "20200610", "20200615")));

        verify(notifier, never()).bookingConflict(any(), any(), anyBoolean(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void conflictIsResolvedOnceTheCollisionDisappears() {
        Reservation direct = manualReservation("2030-06-12", "2030-06-14");
        List<ParsedIcalEvent> feed = List.of(event("a1", "20300610", "20300615"));
        reconcile(feed);

        direct.setStatus(ReservationStatus.CANCELLED);
        reservationRepository.save(direct);
        reconcile(feed);

        assertEquals(ConflictStatus.RESOLVED,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow().getStatus());
        assertEquals(ReservationStatus.CONFIRMED, reservationFor("a1").getStatus());
    }

    @Test
    void conflictIsResolvedWhenTheEventVanishesFromTheFeed() {
        manualReservation("2030-06-12", "2030-06-14");
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of());
        assertEquals(ConflictStatus.RESOLVED,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow().getStatus());
    }

    @Test
    void aConflictStaysOpenWhileAnEmptyFeedHasBookingsWaiting() {
        manualReservation("2030-06-12", "2030-06-14");
        reconcile(List.of(event("clash", "20300610", "20300615"), event("a1", "20300701", "20300705")));
        reconcile(List.of());
        assertEquals(ConflictStatus.OPEN,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "clash").orElseThrow().getStatus());
    }

    @Test
    void moveIntoAnotherBookingKeepsOldDatesAndFlagsConflict() {
        manualReservation("2030-07-01", "2030-07-05");
        reconcile(List.of(event("a1", "20300610", "20300615")));
        reconcile(List.of(event("a1", "20300630", "20300703")));

        Reservation r = reservationFor("a1");
        assertEquals(LocalDate.of(2030, 6, 10), r.getStayRange().lower());
        assertEquals(ConflictKind.CHANGE_OVERLAP,
                conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").orElseThrow().getKind());
    }

    @Test
    void backToBackStaysAreNotConflicts() {
        manualReservation("2030-06-05", "2030-06-10");
        reconcile(List.of(event("a1", "20300610", "20300615")));
        assertNotNull(reservationFor("a1"));
        assertTrue(conflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), "a1").isEmpty());
    }

    @Test
    void ourOwnExportedEventsEchoedBackAreIgnored() {
        reconcile(List.of(event(UUID.randomUUID() + "@roomtrack", "20300610", "20300615")));
        assertTrue(externalEventRepository.findAllByExternalCalendarId(calendar.getId()).isEmpty());
        assertTrue(reservationRepository.findAllByUnitIdAndStatusNot(unit.getId(), ReservationStatus.CANCELLED).isEmpty());
    }
}
