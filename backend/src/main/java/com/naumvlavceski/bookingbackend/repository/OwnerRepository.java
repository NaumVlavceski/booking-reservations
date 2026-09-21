package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Owner;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface OwnerRepository extends JpaRepository<Owner, UUID> {
}
