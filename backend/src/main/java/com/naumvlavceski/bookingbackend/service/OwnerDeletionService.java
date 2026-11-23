package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The one routine that deletes an owner with everything that belongs to it. Used by the owner's own "Delete my
 * account" (AccountService), the demo cleanup (DemoAccounts) and the admin's Delete owner (AdminDeleteService); each
 * caller does its own checks, logging and emails. Extracted unchanged from AccountService (admin panel, Batch C).
 */
@Service
@RequiredArgsConstructor
public class OwnerDeletionService {
    private final AppUserRepository appUserRepository;
    private final EntityManager entityManager;

    /** What {@link #deleteOwnerData} removed. */
    public record Deleted(List<AppUser> users, int properties, int rooms, int reservations, int emailLogRows) {}

    /**
     * Deletes, in one transaction: email log rows (the owner's, and any still addressed to its users), synced
     * calendar events, booking conflicts, calendars, reservations with their guest details, rooms (and so their feed
     * links), properties, verification and reset codes, the users and the owner. Rows that reference the users with
     * ON DELETE CASCADE go with them (admin notes, admin step-up codes, admin sessions). Every session ends because
     * the users are gone (tokens are also bound to the user id). No checks, logging or email.
     */
    @Transactional
    public Deleted deleteOwnerData(UUID ownerId) {
        List<AppUser> users = appUserRepository.findAllByOwnerId(ownerId);
        List<UUID> userIds = users.stream().map(AppUser::getId).toList();
        List<String> emails = users.stream().map(u -> u.getEmail().toLowerCase(Locale.ROOT)).toList();
        entityManager.flush();
        entityManager.clear();

        int emailLogRows = delete("delete from EmailLog e where e.ownerId = :ownerId or lower(e.toAddress) in :emails",
                Map.of("ownerId", ownerId, "emails", emails));
        delete("delete from ExternalEvent e where e.externalCalendarId in "
                + "(select c.id from ExternalCalendar c where c.unitId in (select u.id from Unit u where u.ownerId = :ownerId))",
                Map.of("ownerId", ownerId));
        delete("delete from SyncConflict c where c.ownerId = :ownerId "
                + "or c.unitId in (select u.id from Unit u where u.ownerId = :ownerId)", Map.of("ownerId", ownerId));
        delete("delete from ExternalCalendar c where c.unitId in (select u.id from Unit u where u.ownerId = :ownerId)",
                Map.of("ownerId", ownerId));
        int reservations = delete("delete from Reservation r where r.ownerId = :ownerId "
                + "or r.unit.id in (select u.id from Unit u where u.ownerId = :ownerId)", Map.of("ownerId", ownerId));
        int rooms = delete("delete from Unit u where u.ownerId = :ownerId", Map.of("ownerId", ownerId));
        int properties = delete("delete from Property p where p.owner.id = :ownerId", Map.of("ownerId", ownerId));
        delete("delete from EmailVerification v where v.userId in :userIds", Map.of("userIds", userIds));
        delete("delete from PasswordReset r where r.userId in :userIds", Map.of("userIds", userIds));
        delete("delete from AppUser u where u.owner.id = :ownerId", Map.of("ownerId", ownerId));
        delete("delete from Owner o where o.id = :ownerId", Map.of("ownerId", ownerId));
        return new Deleted(users, properties, rooms, reservations, emailLogRows);
    }

    private int delete(String jpql, Map<String, Object> params) {
        var query = entityManager.createQuery(jpql);
        params.forEach(query::setParameter);
        return query.executeUpdate();
    }
}
