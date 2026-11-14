package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.ExternalEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.Optional;
import java.util.UUID;

public interface ExternalEventRepository extends JpaRepository<ExternalEvent, UUID> {
    Optional<ExternalEvent> findByExternalCalendarIdAndUid(UUID externalCalendarId, String uid);
    List<ExternalEvent> findAllByExternalCalendarId(UUID externalCalendarId);
    boolean existsByReservationId(UUID reservationId);

    /** With 0: the booking's feed listed it at its last read, so it is cancelled on the channel (ReservationService). */
    boolean existsByReservationIdAndMissingSyncs(UUID reservationId, int missingSyncs);

    List<ExternalEvent> findAllByReservationIdIn(Collection<UUID> reservationIds);

    /** The booking became a Direct one: its channel's events no longer say anything about it. */
    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ExternalEvent e WHERE e.reservationId = :id")
    void unlinkReservation(@Param("id") UUID reservationId);


}
