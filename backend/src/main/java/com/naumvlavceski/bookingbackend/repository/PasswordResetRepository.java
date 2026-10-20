package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.PasswordReset;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetRepository extends JpaRepository<PasswordReset, UUID> {

    /** The newest request whose code has not been spent yet. Locked, so parallel guesses cannot dodge the attempt counter. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PasswordReset> findFirstByUserIdAndUsedAtIsNullAndResetTokenHashIsNullOrderByCreatedAtDesc(UUID userId);

    /** Locked, so the same token cannot be redeemed twice in parallel. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PasswordReset> findByResetTokenHash(String resetTokenHash);

    Optional<PasswordReset> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserIdAndCreatedAtAfter(UUID userId, Instant after);

    /** Closes every open request of the user: older codes and any reset token not redeemed yet. */
    @Modifying
    @Query("update PasswordReset r set r.usedAt = :now where r.userId = :userId and r.usedAt is null")
    int invalidateOpen(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("delete from PasswordReset r where r.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
