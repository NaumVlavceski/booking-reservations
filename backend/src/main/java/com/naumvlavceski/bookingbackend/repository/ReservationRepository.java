package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {
    List<Reservation> findAllByOwnerId(UUID ownerId);
    List<Reservation> findAllByUnitIdAndOwnerId(UUID unitId, UUID ownerId);
    Optional<Reservation> findByIdAndOwnerId(UUID id, UUID ownerId);

    List<Reservation> findAllByUnitIdAndStatusNot(UUID id, ReservationStatus reservationStatus);
}
