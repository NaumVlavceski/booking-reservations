package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Owner;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface OwnerRepository extends JpaRepository<Owner, UUID> {
    boolean existsByIdAndDemoTrue(UUID id);

    long countByDemoTrue();

    List<Owner> findAllByDemoTrue();

    List<Owner> findAllByDemoTrueAndCreatedAtBefore(LocalDateTime before);
}
