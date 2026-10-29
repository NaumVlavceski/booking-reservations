package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
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
    @Modifying
    @Query("update AppUser u set u.tokenVersion = u.tokenVersion + 1 where u.id = :userId")
    int incrementTokenVersion(@Param("userId") UUID userId);

    /** New password and a bumped token version in one statement, so every existing session ends with the old password. */
    @Modifying
    @Query("update AppUser u set u.passwordHash = :passwordHash, u.tokenVersion = u.tokenVersion + 1, "
            + "u.updatedAt = :now where u.id = :userId")
    int changePasswordAndRevokeSessions(@Param("userId") UUID userId,
                                        @Param("passwordHash") String passwordHash,
                                        @Param("now") LocalDateTime now);
}
