package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import io.hypersistence.utils.hibernate.type.range.Range;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    /**
     * One owner's cancelled bookings. Without a date: most recently cancelled first. With a date: stays
     * checking in on or after it, latest check-in first. {@code namePrefix} is already lower-cased and
     * LIKE-escaped with '!' (see ReservationService); null means no name filter.
     */
    @Query(value = """
            SELECT * FROM reservation
            WHERE owner_id = :ownerId
              AND status = 'CANCELLED'
              AND (CAST(:namePrefix AS text) IS NULL OR lower(guest_name) LIKE CAST(:namePrefix AS text) ESCAPE '!')
              AND (CAST(:from AS date) IS NULL OR lower(stay_range) >= CAST(:from AS date))
            ORDER BY CASE WHEN CAST(:from AS date) IS NULL THEN NULL ELSE lower(stay_range) END DESC NULLS LAST,
                     cancelled_at DESC NULLS LAST, id
            """,
            countQuery = """
            SELECT count(*) FROM reservation
            WHERE owner_id = :ownerId
              AND status = 'CANCELLED'
              AND (CAST(:namePrefix AS text) IS NULL OR lower(guest_name) LIKE CAST(:namePrefix AS text) ESCAPE '!')
              AND (CAST(:from AS date) IS NULL OR lower(stay_range) >= CAST(:from AS date))
            """,
            nativeQuery = true)
    Page<Reservation> findCancelled(@Param("ownerId") UUID ownerId,
                                    @Param("namePrefix") String namePrefix,
                                    @Param("from") LocalDate from,
                                    Pageable pageable);

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