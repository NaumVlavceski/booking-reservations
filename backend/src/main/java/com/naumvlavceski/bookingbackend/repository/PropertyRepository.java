package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.model.Property;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PropertyRepository extends JpaRepository<Property, UUID> {
    List<Property> findAllByOwnerId(UUID ownerId);
    Optional<Property> findByIdAndOwnerId(UUID id, UUID ownerId);

    UUID owner(Owner owner);
}
