package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.*;
import com.naumvlavceski.bookingbackend.repository.ExternalEventRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.SyncConflictRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import io.hypersistence.utils.hibernate.type.range.Range;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class IcalReconciler {

    private static final UUID NO_EXCLUSION = new UUID(0L, 0L);
    private static final String OWN_UID_SUFFIX = "@staytrack";

    private final ExternalEventRepository externalEventRepository;
    private final ReservationRepository reservationRepository;
    private final UnitRepository unitRepository;
    private final SyncConflictRepository syncConflictRepository;

    @Transactional
    public void reconcile(ExternalCalendar calendar, List<ParsedIcalEvent> incomingEvents) {
        Unit unit = unitRepository.findById(calendar.getUnitId())
                .orElseThrow(() -> new IllegalStateException("Unit not found for calendar " + calendar.getId()));

        List<ExternalEvent> existingEvents =
                externalEventRepository.findAllByExternalCalendarId(calendar.getId());

        Set<String> incomingUids = new HashSet<>();
        for (ParsedIcalEvent incoming : incomingEvents) {
            if (incoming.uid().endsWith(OWN_UID_SUFFIX)) continue; // our own export echoed back
            incomingUids.add(incoming.uid());
            reconcileOne(calendar, unit, incoming);
        }

        for (ExternalEvent existing : existingEvents) {
            if (!incomingUids.contains(existing.getUid())) {
                cancelIfPresent(existing);
            }
        }

        // An incoming event that vanished from the feed no longer needs a human
        for (SyncConflict conflict : syncConflictRepository
                .findAllByExternalCalendarIdAndStatus(calendar.getId(), ConflictStatus.OPEN)) {
            if (!incomingUids.contains(conflict.getExternalUid())) {
                resolve(conflict);
            }
        }
    }

    private void reconcileOne(ExternalCalendar calendar, Unit unit, ParsedIcalEvent incoming) {
        String newHash = IcalParser.hash(incoming.rawBlock());
        Optional<ExternalEvent> existingOpt = externalEventRepository
                .findByExternalCalendarIdAndUid(calendar.getId(), incoming.uid());

        if (existingOpt.isEmpty()) {
            List<Reservation> overlaps = reservationRepository.findOverlapping(
                    unit.getId(), incoming.startDate(), incoming.endDate(), NO_EXCLUSION);
            if (!overlaps.isEmpty()) {
                recordConflict(calendar, unit, incoming, overlaps.get(0), ConflictKind.NEW_OVERLAP);
                return; // never create a colliding reservation, never drop the event silently
            }
            createNew(calendar, unit, incoming, newHash);
            resolveConflictIfAny(calendar, incoming.uid());
            return;
        }

        ExternalEvent existing = existingOpt.get();
        existing.setLastSeenAt(LocalDateTime.now());

        if (existing.getRawHash().equals(newHash)) {
            externalEventRepository.save(existing);
            return;
        }
        updateExisting(calendar, unit, incoming, existing, newHash);
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

        ExternalEvent event = new ExternalEvent();
        event.setExternalCalendarId(calendar.getId());
        event.setUid(incoming.uid());
        event.setReservationId(saved.getId());
        event.setRawHash(hash);
        event.setLastSeenAt(LocalDateTime.now());
        externalEventRepository.save(event);
    }

    private void updateExisting(ExternalCalendar calendar, Unit unit, ParsedIcalEvent incoming,
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
        List<Reservation> overlaps = reservationRepository.findOverlapping(
                unit.getId(), incoming.startDate(), incoming.endDate(), reservation.getId());

        if (!overlaps.isEmpty()) {
            // Leave the reservation and the stored hash untouched, so this re-evaluates next sync
            recordConflict(calendar, unit, incoming, overlaps.get(0), ConflictKind.CHANGE_OVERLAP);
            return;
        }

        reservation.setStayRange(Range.closedOpen(incoming.startDate(), incoming.endDate()));
        reservation.setGuestName(incoming.summary());
        reservationRepository.save(reservation);

        existing.setRawHash(newHash);
        externalEventRepository.save(existing);
        resolveConflictIfAny(calendar, incoming.uid());
    }

    private void cancelIfPresent(ExternalEvent existing) {
        if (existing.getReservationId() == null) return;
        reservationRepository.findById(existing.getReservationId()).ifPresent(reservation -> {
            if (reservation.getStatus() != ReservationStatus.CANCELLED) {
                reservation.setStatus(ReservationStatus.CANCELLED);
                reservationRepository.save(reservation);
            }
        });
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