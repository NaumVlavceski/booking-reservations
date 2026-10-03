package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ExternalCalendarRepository extends JpaRepository<ExternalCalendar, UUID> {
    List<ExternalCalendar> findAllByUnitId(UUID unitId);

    @Query("SELECT c FROM ExternalCalendar c WHERE c.lastSyncedAt IS NULL OR c.lastSyncedAt < :cutoff " +
            "ORDER BY c.lastSyncedAt ASC NULLS FIRST")
    List<ExternalCalendar> findDue(@Param("cutoff") Instant cutoff, Pageable pageable);

    @Query("SELECT c FROM ExternalCalendar c JOIN Unit u ON u.id = c.unitId " +
            "WHERE u.ownerId = :ownerId AND c.lastError IS NOT NULL")
    List<ExternalCalendar> findFailingByOwner(@Param("ownerId") UUID ownerId);

}
