package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.ConflictStatus;
import com.naumvlavceski.bookingbackend.model.SyncConflict;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SyncConflictRepository extends JpaRepository<SyncConflict, UUID> {
    Optional<SyncConflict> findByExternalCalendarIdAndExternalUid(UUID calendarId, String uid);
    List<SyncConflict> findAllByExternalCalendarIdAndStatus(UUID calendarId, ConflictStatus status);
    List<SyncConflict> findAllByOwnerIdAndStatusOrderByCreatedAtDesc(UUID ownerId, ConflictStatus status);
    Optional<SyncConflict> findByIdAndOwnerId(UUID id, UUID ownerId);
}
