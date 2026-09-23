package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.ReservationRequest;
import com.naumvlavceski.bookingbackend.dto.ReservationResponse;
import com.naumvlavceski.bookingbackend.dto.UnitResponse;
import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import io.hypersistence.utils.hibernate.type.range.Range;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ReservationService {
    private final ReservationRepository reservationRepository;
    private final UnitRepository unitRepository;

//    public List<ReservationResponse> findAllForOwner(UUID ownerId){
//        return reservationRepository.findAllByOwnerId(ownerId).stream()
//                .map(this::toResponse).toList();
//    }
public List<ReservationResponse> findAllForOwner(UUID ownerId, UUID unitId, ReservationStatus status) {
    List<Reservation> reservations = reservationRepository.findAllByOwnerId(ownerId);

    return reservations.stream()
            .filter(r -> unitId == null || r.getUnit().getId().equals(unitId))
            .filter(r -> status == null || r.getStatus() == status)
            .sorted((a, b) -> a.getStayRange().lower().compareTo(b.getStayRange().lower()))
            .map(this::toResponse)
            .toList();
}
    public ReservationResponse findOneForOwner(UUID ownerId,UUID reservationId){
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId,ownerId).orElseThrow(()->new NoSuchElementException("Reservation not found"));
        return toResponse(reservation);
    }
    public ReservationResponse create(UUID ownerId,ReservationRequest request){
        Unit unit = unitRepository.findByIdAndOwnerId(request.unitId(),ownerId).orElseThrow(()->new NoSuchElementException("Unit not found"));
        if (request.checkIn() == null || request.checkOut() == null) {
            throw new IllegalArgumentException("Check-in and check-out dates are required");
        }
        long nights = ChronoUnit.DAYS.between(request.checkIn(),request.checkOut());
        if (nights <= 0) {
            throw new IllegalArgumentException("Check-out must be after check-in");
        }
        Reservation reservation = new Reservation();
        reservation.setUnit(unit);
        reservation.setOwnerId(ownerId);
        reservation.setStayRange(Range.closedOpen(request.checkIn(), request.checkOut()));
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
    public ReservationResponse update(UUID ownerId,UUID reservationId,ReservationRequest request){
        Unit unit = unitRepository.findByIdAndOwnerId(request.unitId(),ownerId)
                .orElseThrow(()->new NoSuchElementException("Unit not found"));
        if (request.checkIn() == null || request.checkOut() == null) {
            throw new IllegalArgumentException("Check-in and check-out dates are required");
        }
        long nights = ChronoUnit.DAYS.between(request.checkIn(),request.checkOut());
        if (nights <= 0) {
            throw new IllegalArgumentException("Check-out must be after check-in");
        }
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId,ownerId)
                .orElseThrow(()->new NoSuchElementException("Reservation not found"));
        reservation.setUnit(unit);
        reservation.setStayRange(Range.closedOpen(request.checkIn(), request.checkOut()));
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
    public void delete(UUID ownerId,UUID reservationId){
        Reservation reservation = reservationRepository.findByIdAndOwnerId(reservationId,ownerId).orElseThrow(()->new NoSuchElementException("Reservation not found"));
        reservationRepository.delete(reservation);
    }
    public List<ReservationResponse> listByUnit(UUID ownerId, UUID unitId){
        return reservationRepository.findAllByUnitIdAndOwnerId(unitId,ownerId)
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
                r.getNotes()
        );
    }
}
