package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
    Optional<AppUser> findByEmail(String email);
    Optional<AppUser> findFirstByOwnerId(UUID ownerId);
    List<AppUser> findAllByOwnerIdAndActiveTrue(UUID ownerId);
    boolean existsByEmail(String email);
    Optional<AppUser> findFirstByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCase(String email);
}
