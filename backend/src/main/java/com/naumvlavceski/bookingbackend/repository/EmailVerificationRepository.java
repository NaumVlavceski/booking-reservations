package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.EmailVerification;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, UUID> {

    /** Locked, so parallel guesses cannot dodge the attempt counter. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EmailVerification> findFirstByUserIdAndConsumedAtIsNullOrderByCreatedAtDesc(UUID userId);

    Optional<EmailVerification> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserIdAndCreatedAtAfter(UUID userId, Instant after);

    @Modifying
    @Query("update EmailVerification v set v.consumedAt = :now where v.userId = :userId and v.consumedAt is null")
    int invalidateOpen(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("delete from EmailVerification v where v.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
