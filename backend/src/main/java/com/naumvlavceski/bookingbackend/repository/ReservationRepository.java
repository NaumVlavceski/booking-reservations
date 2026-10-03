package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import io.hypersistence.utils.hibernate.type.range.Range;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {
    List<Reservation> findAllByOwnerId(UUID ownerId);

    List<Reservation> findAllByUnitIdAndOwnerId(UUID unitId, UUID ownerId);

    Optional<Reservation> findByIdAndOwnerId(UUID id, UUID ownerId);

    List<Reservation> findAllByUnitIdAndStatusNot(UUID id, ReservationStatus reservationStatus);

    @Query(value = """
            SELECT * FROM reservation
            WHERE unit_id = :unitId
              AND status <> 'CANCELLED'
              AND id <> :excludeId
              AND stay_range && daterange(:start, :end, '[)')
            """, nativeQuery = true)
    List<Reservation> findOverlapping(@Param("unitId") UUID unitId,
                                      @Param("start") LocalDate start,
                                      @Param("end") LocalDate end,
                                      @Param("excludeId") UUID excludeId);
}