package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.exception.DatesTakenException;
import com.naumvlavceski.bookingbackend.dto.MoveOptionResponse;
import com.naumvlavceski.bookingbackend.dto.PageResponse;
import com.naumvlavceski.bookingbackend.dto.ReservationRequest;
import com.naumvlavceski.bookingbackend.dto.ReservationResponse;
import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import io.hypersistence.utils.hibernate.type.range.Range;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ReservationService {
    private final ReservationRepository reservationRepository;
    private final UnitRepository unitRepository;

    public List<ReservationResponse> findAllForOwner(UUID ownerId, UUID unitId, ReservationStatus status) {
        List<Reservation> reservations = reservationRepository.findAllByOwnerId(ownerId);

        return reservations.stream()
                .filter(r -> unitId == null || r.getUnit().getId().equals(unitId))
                .filter(r -> status != null ? r.getStatus() == status : r.getStatus() != ReservationStatus.CANCELLED)
                .sorted((a, b) -> a.getStayRange().lower().compareTo(b.getStayRange().lower()))
                .map(this::toResponse)
                .toList();
    }

    private static final int MAX_PAGE_SIZE = 100;
    private static final UUID NO_ID = new UUID(0, 0);


    public PageResponse<ReservationResponse> listCancelled(UUID ownerId, String name, LocalDate checkInFrom,
                                                           int page, int size) {
        String trimmed = name == null ? "" : name.trim();
        String prefix = trimmed.isEmpty() ? null
                : trimmed.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE));

        Page<Reservation> result = reservationRepository.findCancelled(ownerId, prefix, checkInFrom, pageable);
        return new PageResponse<>(result.getContent().stream().map(this::toResponse).toList(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    public ReservationResponse findOneForOwner(UUID ownerId, UUID reservationId) {
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId, ownerId).orElseThrow(() -> new NoSuchElementException("Reservation not found"));
        return toResponse(reservation);
    }

    public ReservationResponse create(UUID ownerId, ReservationRequest request) {
        Unit unit = unitRepository.findByIdAndOwnerId(request.unitId(), ownerId).orElseThrow(() -> new NoSuchElementException("Room not found"));
        if (request.checkIn() == null || request.checkOut() == null) {
            throw new IllegalArgumentException("Check-in and check-out dates are required");
        }
        long nights = ChronoUnit.DAYS.between(request.checkIn(), request.checkOut());
        if (nights <= 0) {
            throw new IllegalArgumentException("Check-out must be after check-in");
        }
        ReservationStatus status = request.status() != null ? request.status() : ReservationStatus.CONFIRMED;
        if (status != ReservationStatus.CANCELLED) rejectIfTaken(unit, request.checkIn(), request.checkOut(), NO_ID);
        Reservation reservation = new Reservation();
        reservation.setUnit(unit);
        reservation.setOwnerId(ownerId);
        reservation.setStayRange(Range.closedOpen(request.checkIn(), request.checkOut()));
        reservation.setStatus(status);
        reservation.setGuestName(request.guestName());
        reservation.setGuestEmail(request.guestEmail());
        reservation.setGuestPhone(request.guestPhone());
        reservation.setGuestsCount(request.guestsCount() != null ? request.guestsCount() : 2);
        reservation.setPricePerGuest(request.pricePerGuest());
        reservation.setNightlyRate(request.nightlyRate());
        reservation.setTotalAmount(request.totalAmount());
        reservation.setNotes(request.notes());
        Reservation saved = reservationRepository.save(reservation);
        return toResponse(saved);
    }

    public ReservationResponse update(UUID ownerId, UUID reservationId, ReservationRequest request) {
        Unit unit = unitRepository.findByIdAndOwnerId(request.unitId(), ownerId)
                .orElseThrow(() -> new NoSuchElementException("Room not found"));
        if (request.checkIn() == null || request.checkOut() == null) {
            throw new IllegalArgumentException("Check-in and check-out dates are required");
        }
        long nights = ChronoUnit.DAYS.between(request.checkIn(), request.checkOut());
        if (nights <= 0) {
            throw new IllegalArgumentException("Check-out must be after check-in");
        }
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Reservation not found"));
        ReservationStatus status = request.status() != null ? request.status() : reservation.getStatus();
        if (status != ReservationStatus.CANCELLED) rejectIfTaken(unit, request.checkIn(), request.checkOut(), reservationId);
        reservation.setUnit(unit);
        reservation.setStayRange(Range.closedOpen(request.checkIn(), request.checkOut()));
        reservation.setStatus(status);
        reservation.setGuestName(request.guestName());
        reservation.setGuestEmail(request.guestEmail());
        reservation.setGuestPhone(request.guestPhone());
        reservation.setGuestsCount(request.guestsCount() != null ? request.guestsCount() : 2);
        reservation.setPricePerGuest(request.pricePerGuest());
        reservation.setNightlyRate(request.nightlyRate());
        reservation.setTotalAmount(request.totalAmount());
        reservation.setNotes(request.notes());
        reservation.setPriceNeedsReview(false);
        Reservation saved = reservationRepository.save(reservation);
        return toResponse(saved);
    }

    public List<MoveOptionResponse> availableOptions(UUID ownerId, UUID reservationId) {
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Reservation not found"));
        if (reservation.getStatus() == ReservationStatus.CANCELLED) return List.of();
        LocalDate start = reservation.getStayRange().lower();
        LocalDate end = reservation.getStayRange().upper();
        UUID propertyId = reservation.getUnit().getProperty().getId();
        return unitRepository.findAllByPropertyIdAndOwnerId(propertyId, ownerId).stream()
                .filter(u -> !u.getId().equals(reservation.getUnit().getId()))
                .filter(u -> reservationRepository.findOverlapping(u.getId(), start, end, reservationId).isEmpty())
                .map(u -> new MoveOptionResponse(u.getId(), u.getName()))
                .toList();
    }

    public ReservationResponse move(UUID ownerId, UUID reservationId, UUID targetUnitId) {
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Reservation not found"));
        if (reservation.getStatus() == ReservationStatus.CANCELLED) {
            throw new IllegalArgumentException("A cancelled booking can't be moved");
        }
        Unit target = unitRepository.findByIdAndOwnerId(targetUnitId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Room not found"));
        if (target.getId().equals(reservation.getUnit().getId())) {
            throw new IllegalArgumentException("The booking is already in this room");
        }
        if (!target.getProperty().getId().equals(reservation.getUnit().getProperty().getId())) {
            throw new IllegalArgumentException("A booking can only be moved to a room in the same property");
        }
        rejectIfTaken(target, reservation.getStayRange().lower(), reservation.getStayRange().upper(), reservationId);
        reservation.setUnit(target);
        return toResponse(reservationRepository.save(reservation));
    }
    @Transactional
    public List<ReservationResponse> copy(UUID ownerId, UUID reservationId, List<UUID> targetsUnitsIds) {
        Reservation source = reservationRepository.findByIdAndOwnerId(reservationId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Reservation not found"));
        if (source.getStatus() == ReservationStatus.CANCELLED) {
            throw new IllegalArgumentException("A cancelled booking can't be copied");
        }
        UUID propertyId = source.getUnit().getProperty().getId();
        LocalDate start = source.getStayRange().lower();
        LocalDate end = source.getStayRange().upper();
        List<ReservationResponse> copies = new ArrayList<>();
        for (UUID targetUnitId : targetsUnitsIds.stream().distinct().toList()) {
            Unit unit = unitRepository.findByIdAndOwnerId(targetUnitId,ownerId)
                    .orElseThrow(() -> new NoSuchElementException("Room not found"));
            if (unit.getId().equals(source.getUnit().getId())
                    || !unit.getProperty().getId().equals(propertyId)) {
                throw new IllegalArgumentException("A booking can only be copied to other rooms of the same property");
            }
            rejectIfTaken(unit, start, end, source.getId());

            Reservation copy = new Reservation();
            copy.setUnit(unit);
            copy.setOwnerId(ownerId);
            copy.setStayRange(source.getStayRange());
            copy.setStatus(source.getStatus());
            copy.setGuestName(source.getGuestName());
            copy.setGuestEmail(source.getGuestEmail());
            copy.setGuestPhone(source.getGuestPhone());
            copy.setGuestsCount(source.getGuestsCount());
            copy.setNotes(source.getNotes());
            copies.add(toResponse(reservationRepository.save(copy)));
        }
        return copies;
    }

    /** Refuses dates that overlap another live booking of the room, saying which (the DB constraint no_overlap stays the backstop). */
    private void rejectIfTaken(Unit unit, LocalDate checkIn, LocalDate checkOut, UUID excludeId) {
        List<Reservation> overlaps = reservationRepository.findOverlapping(unit.getId(), checkIn, checkOut, excludeId);
        if (!overlaps.isEmpty()) {
            Reservation taken = overlaps.get(0);
            throw new DatesTakenException(unit.getName(), taken.getStayRange().lower(), taken.getStayRange().upper());
        }
    }

    public void delete(UUID ownerId, UUID reservationId) {
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId, ownerId).orElseThrow(() -> new NoSuchElementException("Reservation not found"));
        reservation.setStatus(ReservationStatus.CANCELLED);
        reservationRepository.save(reservation);
    }

    public List<ReservationResponse> listByUnit(UUID ownerId, UUID unitId) {
        return reservationRepository.findAllByUnitIdAndOwnerId(unitId, ownerId)
                .stream().map(this::toResponse).toList();
    }

    private ReservationResponse toResponse(Reservation r) {
        return new ReservationResponse(
                r.getId(),
                r.getUnit().getId(),
                r.getStayRange().lower(),
                r.getStayRange().upper(),
                r.getStatus(),
                r.getSource(),
                r.getGuestName(),
                r.getGuestEmail(),
                r.getGuestPhone(),
                r.getGuestsCount(),
                r.getPricePerGuest(),
                r.getNightlyRate(),
                r.getTotalAmount(),
                r.getNotes(),
                r.isPriceNeedsReview(),
                r.getCancelledAt()
        );
    }
}
