package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.mail.ReservationNotifier;
import com.naumvlavceski.bookingbackend.model.*;
import com.naumvlavceski.bookingbackend.repository.ExternalEventRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.SyncConflictRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import io.hypersistence.utils.hibernate.type.range.Range;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class IcalReconciler {

    private static final UUID NO_EXCLUSION = new UUID(0L, 0L);
    private static final String OWN_UID_SUFFIX = "@roomtrack";
    private static final String LEGACY_UID_SUFFIX = "@staytrack"; // feeds exported before the rename

    private static final int SYNCS_MISSING_BEFORE_CANCEL = 2;
    private static final Duration MISSING_FROM_EMPTY_FEED_BEFORE_CANCEL = Duration.ofHours(6);

    private final ExternalEventRepository externalEventRepository;
    private final ReservationRepository reservationRepository;
    private final UnitRepository unitRepository;
    private final SyncConflictRepository syncConflictRepository;
    private final ReservationNotifier notifier;

    @Transactional
    public void reconcile(ExternalCalendar calendar, ParseResult feed) {
        Unit unit = unitRepository.findById(calendar.getUnitId())
                .orElseThrow(() -> new IllegalStateException("Unit not found for calendar " + calendar.getId()));

        List<ExternalEvent> existingEvents =
                externalEventRepository.findAllByExternalCalendarId(calendar.getId());

        // An entry we can't name could be any booking, so nothing counts as missing from this read
        boolean partialRead = feed.unreadable() > 0;
        boolean emptyFeed = feed.events().isEmpty() && feed.skipped() == 0;

        List<ParsedIcalEvent> incomingEvents = feed.events().stream()
                .filter(e -> !e.uid().endsWith(OWN_UID_SUFFIX) && !e.uid().endsWith(LEGACY_UID_SUFFIX)) // our own export echoed back
                .toList();
        // Still in the feed, even if an event couldn't be used
        Set<String> uidsInFeed = new HashSet<>(feed.rejectedUids());
        incomingEvents.forEach(e -> uidsInFeed.add(e.uid()));

        Optional<String> movedTo = partialRead ? Optional.empty()
                : moveBookingToItsNewEvent(calendar, existingEvents, incomingEvents, uidsInFeed);
        for (ParsedIcalEvent incoming : incomingEvents) {
            if (movedTo.isPresent() && movedTo.get().equals(incoming.uid())) continue; // handled just above
            reconcileOne(calendar, unit, incoming);
        }

        boolean waitingToCancel = false;
        for (ExternalEvent existing : existingEvents) {
            if (uidsInFeed.contains(existing.getUid())) {
                existing.setMissingSince(null);
                existing.setMissingSyncs(0);
            } else if (!partialRead && !cancelIfGoneLongEnough(existing, emptyFeed)) {
                waitingToCancel = true;
            }
        }
        // The confirming read comes soon, not at the usual pace; an empty feed waits hours anyway
        calendar.setRecheckSoon(waitingToCancel && !emptyFeed);

        // An incoming event that vanished from the feed no longer needs a human
        if (partialRead || (emptyFeed && waitingToCancel)) return;
        for (SyncConflict conflict : syncConflictRepository
                .findAllByExternalCalendarIdAndStatus(calendar.getId(), ConflictStatus.OPEN)) {
            if (!uidsInFeed.contains(conflict.getExternalUid())) {
                resolve(conflict);
            }
        }
    }

    /**
     * Owner's decision (2026-11-14): Booking.com gives a booking a new UID when its check-in day changes (the UID
     * follows the room and check-in day), so a moved check-in reads as one booking gone and another one new. When
     * the match is clear (exactly one live booking of this calendar gone from the feed, exactly one new event
     * overlapping it, and nothing else in its way), it is taken as the same booking with new dates: it
     * keeps its price, notes and guest, the owner gets one "dates changed" email, and there is no conflict or
     * cancellation. Anything less clear (no overlap, several candidates) stays a cancellation plus a new booking.
     * Accepted risk: a cancellation and an unrelated overlapping booking in the same few minutes look the same; the
     * email and the "check the price" flag point the owner to it.
     *
     * @return the UID of the new event, if a booking was moved onto it
     */
    private Optional<String> moveBookingToItsNewEvent(ExternalCalendar calendar, List<ExternalEvent> existingEvents,
                                                      List<ParsedIcalEvent> incomingEvents, Set<String> uidsInFeed) {
        List<ExternalEvent> gone = new ArrayList<>();
        Map<UUID, Reservation> goneBookings = new HashMap<>();
        for (ExternalEvent e : existingEvents) {
            if (uidsInFeed.contains(e.getUid()) || e.getReservationId() == null) continue;
            reservationRepository.findById(e.getReservationId())
                    .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
                    .filter(r -> r.getStayRange().upper().isAfter(LocalDate.now())) // an ended stay just left the feed
                    .ifPresent(r -> {
                        gone.add(e);
                        goneBookings.put(e.getId(), r);
                    });
        }
        if (gone.size() != 1) return Optional.empty();
        ExternalEvent event = gone.getFirst();
        Reservation reservation = goneBookings.get(event.getId());

        LocalDate oldStart = reservation.getStayRange().lower();
        LocalDate oldEnd = reservation.getStayRange().upper();
        Set<String> knownUids = new HashSet<>();
        existingEvents.forEach(e -> knownUids.add(e.getUid()));
        List<ParsedIcalEvent> candidates = incomingEvents.stream()
                .filter(e -> !knownUids.contains(e.uid()))
                .filter(e -> e.startDate().isBefore(oldEnd) && oldStart.isBefore(e.endDate()))
                .toList();
        if (candidates.size() != 1) return Optional.empty(); // no overlap: a cancellation and a new booking
        ParsedIcalEvent incoming = candidates.getFirst();

        Unit room = reservation.getUnit();
        if (!reservationRepository.findOverlapping(room.getId(), incoming.startDate(), incoming.endDate(),
                reservation.getId()).isEmpty()) {
            return Optional.empty(); // something else is in the way: the usual conflict handling applies
        }

        reservation.setStayRange(Range.closedOpen(incoming.startDate(), incoming.endDate()));
        BigDecimal keptPrice = reservation.getTotalAmount();
        boolean priceNeedsReview = keptPrice != null && keptPrice.signum() > 0;
        if (priceNeedsReview) reservation.setPriceNeedsReview(true);
        reservationRepository.save(reservation);

        event.setUid(incoming.uid());
        event.setRawHash(IcalParser.hash(incoming.rawBlock()));
        event.setLastSeenAt(LocalDateTime.now());
        event.setMissingSince(null);
        event.setMissingSyncs(0);
        externalEventRepository.save(event);
        resolveConflictIfAny(calendar, incoming.uid()); // the false "overlap" an earlier sync may have filed

        if (incoming.endDate().isAfter(LocalDate.now())) {
            notifier.externalReservationModified(room, calendar.getPlatform(), oldStart, oldEnd,
                    incoming.startDate(), incoming.endDate(), reservation.getGuestName(),
                    priceNeedsReview ? keptPrice : null);
        }
        return Optional.of(incoming.uid());
    }

    private void reconcileOne(ExternalCalendar calendar, Unit unit, ParsedIcalEvent incoming) {
        String newHash = IcalParser.hash(incoming.rawBlock());
        Optional<ExternalEvent> existingOpt = externalEventRepository
                .findByExternalCalendarIdAndUid(calendar.getId(), incoming.uid());
        if (existingOpt.isEmpty()) {
            List<Reservation> overlaps = reservationRepository.findOverlapping(
                    unit.getId(), incoming.startDate(), incoming.endDate(), NO_EXCLUSION);
            if (!overlaps.isEmpty()) {
                Reservation colliding = overlaps.get(0);
                if (isThisBookingFromAnEarlierConnection(colliding, calendar, incoming)) {
                    linkEvent(calendar, incoming, colliding.getId(), newHash);
                    resolveConflictIfAny(calendar, incoming.uid());
                    return;
                }
                recordConflict(calendar, unit, incoming, colliding, ConflictKind.NEW_OVERLAP);
                return; // never create a colliding reservation, never drop the event silently
            }
            createNew(calendar, unit, incoming, newHash);
            resolveConflictIfAny(calendar, incoming.uid());
            // The first successful sync imports the whole existing feed; only later arrivals are news
            if (calendar.getLastSuccessAt() != null && incoming.endDate().isAfter(LocalDate.now())) {
                notifier.externalReservationImported(unit, calendar.getPlatform(),
                        incoming.startDate(), incoming.endDate(), incoming.summary());
            }
            return;
        }

        ExternalEvent existing = existingOpt.get();
        existing.setLastSeenAt(LocalDateTime.now());
        if (existing.getRawHash().equals(newHash)) {
            reviveIfCancelled(calendar, incoming, existing);
            externalEventRepository.save(existing);
            return;
        }
        updateExisting(calendar, incoming, existing, newHash);
    }

    /**
     * Disconnecting a calendar forgets which event is which booking, but keeps the bookings. When the calendar is
     * connected again (a replaced link, say), each one must be matched back up instead of colliding with itself.
     */
    private boolean isThisBookingFromAnEarlierConnection(Reservation reservation, ExternalCalendar calendar,
                                                         ParsedIcalEvent incoming) {
        return reservation.getSource() == calendar.getPlatform()
                && incoming.startDate().equals(reservation.getStayRange().lower())
                && incoming.endDate().equals(reservation.getStayRange().upper())
                && !externalEventRepository.existsByReservationId(reservation.getId());
    }

    /**
     * Owner's decision (2026-11-14, ICAL-01 revisited): a cancelled booking its channel lists comes back. The sync
     * cancelled it while the event was missing, Booking.com reused the UID for a new booking on that check-in day, or
     * it was cancelled in the app before that was refused (ReservationService): either way the guest holds the dates.
     */
    private void reviveIfCancelled(ExternalCalendar calendar, ParsedIcalEvent incoming, ExternalEvent existing) {
        if (existing.getReservationId() == null) return;
        reservationRepository.findById(existing.getReservationId())
                .filter(r -> r.getStatus() == ReservationStatus.CANCELLED)
                .ifPresent(r -> {
                    // The owner may have moved it: the room it is in now is the one that counts
                    List<Reservation> overlaps = reservationRepository.findOverlapping(
                            r.getUnit().getId(), incoming.startDate(), incoming.endDate(), r.getId());
                    if (!overlaps.isEmpty()) {
                        recordConflict(calendar, r.getUnit(), incoming, overlaps.get(0), ConflictKind.CHANGE_OVERLAP);
                    } else {
                        r.setStatus(ReservationStatus.CONFIRMED);
                        reservationRepository.save(r);
                    }
                });
    }

    private void createNew(ExternalCalendar calendar, Unit unit, ParsedIcalEvent incoming, String hash) {
        Reservation reservation = new Reservation();
        reservation.setUnit(unit);
        reservation.setOwnerId(unit.getOwnerId());
        reservation.setStayRange(Range.closedOpen(incoming.startDate(), incoming.endDate()));
        reservation.setStatus(ReservationStatus.CONFIRMED);
        reservation.setSource(calendar.getPlatform());
        reservation.setGuestName(incoming.summary());
        reservation.setGuestsCount(2); // iCal never tells us this
        Reservation saved = reservationRepository.save(reservation);
        linkEvent(calendar, incoming, saved.getId(), hash);
    }

    private void linkEvent(ExternalCalendar calendar, ParsedIcalEvent incoming, UUID reservationId, String hash) {
        ExternalEvent event = new ExternalEvent();
        event.setExternalCalendarId(calendar.getId());
        event.setUid(incoming.uid());
        event.setReservationId(reservationId);
        event.setRawHash(hash);
        event.setLastSeenAt(LocalDateTime.now());
        externalEventRepository.save(event);
    }

    private void updateExisting(ExternalCalendar calendar, ParsedIcalEvent incoming,
                                ExternalEvent existing, String newHash) {
        Optional<Reservation> reservationOpt = existing.getReservationId() == null
                ? Optional.empty()
                : reservationRepository.findById(existing.getReservationId());

        if (reservationOpt.isEmpty()) {
            // Linked reservation is gone (e.g. owner deleted it). Forget the link;
            // the next sync will treat this event as new.
            externalEventRepository.delete(existing);
            return;
        }

        Reservation reservation = reservationOpt.get();
        // The owner may have moved it: the room it is in now is the one that counts
        Unit room = reservation.getUnit();
        List<Reservation> overlaps = reservationRepository.findOverlapping(
                room.getId(), incoming.startDate(), incoming.endDate(), reservation.getId());

        if (!overlaps.isEmpty()) {
            // Leave the reservation and the stored hash untouched, so this re-evaluates next sync
            recordConflict(calendar, room, incoming, overlaps.get(0), ConflictKind.CHANGE_OVERLAP);
            return;
        }

        // Cancelled and now listed again, changed (see reviveIfCancelled): Booking.com rewrites DTSTAMP on every
        // download and reuses an event's UID for a new booking, so "changed" is the usual way a booking comes back.
        boolean revived = reservation.getStatus() == ReservationStatus.CANCELLED;
        if (revived) reservation.setStatus(ReservationStatus.CONFIRMED);

        LocalDate oldStart = reservation.getStayRange().lower();
        LocalDate oldEnd = reservation.getStayRange().upper();
        reservation.setStayRange(Range.closedOpen(incoming.startDate(), incoming.endDate()));
        boolean datesChanged = !oldStart.equals(incoming.startDate()) || !oldEnd.equals(incoming.endDate());
        BigDecimal keptPrice = reservation.getTotalAmount();
        boolean priceNeedsReview = datesChanged && keptPrice != null && keptPrice.signum() > 0;
        if (priceNeedsReview)
            reservation.setPriceNeedsReview(true);
        reservationRepository.save(reservation);

        // Not for a restored booking: "changed from <dates of a booking you were told was cancelled>" would confuse
        if (datesChanged && !revived && reservation.getStatus() != ReservationStatus.CANCELLED
                && incoming.endDate().isAfter(LocalDate.now())) {
            notifier.externalReservationModified(room, calendar.getPlatform(), oldStart, oldEnd,
                    incoming.startDate(), incoming.endDate(), reservation.getGuestName(),
                    priceNeedsReview ? keptPrice : null);
        }

        existing.setRawHash(newHash);
        externalEventRepository.save(existing);
        resolveConflictIfAny(calendar, incoming.uid());
    }

    /**
     * For an event that is not in the feed. Answers false while its booking is still waiting to be cancelled.
     * A stay that has ended is history: feeds drop old events, and that says nothing about whether the stay happened.
     */
    private boolean cancelIfGoneLongEnough(ExternalEvent existing, boolean emptyFeed) {
        if (existing.getReservationId() == null) return true;
        Reservation reservation = reservationRepository.findById(existing.getReservationId()).orElse(null);
        if (reservation == null
                || reservation.getStatus() == ReservationStatus.CANCELLED
                || !reservation.getStayRange().upper().isAfter(LocalDate.now())) {
            return true;
        }

        Instant now = Instant.now();
        if (existing.getMissingSince() == null) existing.setMissingSince(now);
        existing.setMissingSyncs(existing.getMissingSyncs() + 1);

        if (existing.getMissingSyncs() < SYNCS_MISSING_BEFORE_CANCEL
                || emptyFeed && Duration.between(existing.getMissingSince(), now)
                        .compareTo(MISSING_FROM_EMPTY_FEED_BEFORE_CANCEL) < 0) {
            return false;
        }

        reservation.setStatus(ReservationStatus.CANCELLED);
        reservationRepository.save(reservation);
        notifier.externalReservationCancelled(reservation.getUnit(), reservation.getSource(),
                reservation.getStayRange().lower(), reservation.getStayRange().upper(),
                reservation.getGuestName());
        return true;
    }

    private void recordConflict(ExternalCalendar calendar, Unit unit, ParsedIcalEvent incoming,
                                Reservation colliding, ConflictKind kind) {
        SyncConflict conflict = syncConflictRepository
                .findByExternalCalendarIdAndExternalUid(calendar.getId(), incoming.uid())
                .orElseGet(SyncConflict::new);

        boolean alreadyDismissed = conflict.getStatus() == ConflictStatus.DISMISSED
                && incoming.startDate().equals(conflict.getIncomingStart())
                && incoming.endDate().equals(conflict.getIncomingEnd());
        if (alreadyDismissed) return; // owner already acknowledged this exact collision

        // Syncs repeat every few minutes: only a new or changed conflict is news
        boolean alreadyReported = conflict.getStatus() == ConflictStatus.OPEN
                && incoming.startDate().equals(conflict.getIncomingStart())
                && incoming.endDate().equals(conflict.getIncomingEnd())
                && colliding.getId().equals(conflict.getConflictingReservationId());

        conflict.setOwnerId(unit.getOwnerId());
        conflict.setUnitId(unit.getId());
        conflict.setExternalCalendarId(calendar.getId());
        conflict.setExternalUid(incoming.uid());
        conflict.setPlatform(calendar.getPlatform());
        conflict.setIncomingStart(incoming.startDate());
        conflict.setIncomingEnd(incoming.endDate());
        conflict.setIncomingSummary(incoming.summary());
        conflict.setConflictingReservationId(colliding.getId());
        conflict.setKind(kind);
        conflict.setStatus(ConflictStatus.OPEN);
        conflict.setResolvedAt(null);
        syncConflictRepository.save(conflict);

        if (!alreadyReported && incoming.endDate().isAfter(LocalDate.now())) {
            notifier.bookingConflict(unit, calendar.getPlatform(), kind == ConflictKind.CHANGE_OVERLAP,
                    incoming.startDate(), incoming.endDate(), incoming.summary(),
                    colliding.getSource(), colliding.getStayRange().lower(), colliding.getStayRange().upper(),
                    colliding.getGuestName());
        }
    }

    private void resolveConflictIfAny(ExternalCalendar calendar, String uid) {
        syncConflictRepository.findByExternalCalendarIdAndExternalUid(calendar.getId(), uid)
                .filter(c -> c.getStatus() == ConflictStatus.OPEN)
                .ifPresent(this::resolve);
    }

    private void resolve(SyncConflict conflict) {
        conflict.setStatus(ConflictStatus.RESOLVED);
        conflict.setResolvedAt(LocalDateTime.now());
        syncConflictRepository.save(conflict);
    }
}