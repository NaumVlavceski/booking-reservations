package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Unit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UnitRepository extends JpaRepository<Unit, UUID> {
    List<Unit> findAllByOwnerId(UUID ownerId);
    List<Unit> findAllByPropertyIdAndOwnerId(UUID propertyId, UUID ownerId);
    Optional<Unit> findByIdAndOwnerId(UUID id, UUID ownerId);
}
