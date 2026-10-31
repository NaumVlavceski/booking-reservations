package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.exception.VerificationException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.EmailLog;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.model.Property;
import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.SyncConflict;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.repository.PropertyRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.SyncConflictRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.util.HtmlUtils;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The owner's own data rights: a copy of everything in the account (export) and deleting the account.
 * Both are scoped to the owner of the signed-in user and nothing else.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountService {
    public static final String DELETE_CONFIRMATION = "DELETE";

    private final AppUserRepository appUserRepository;
    private final OwnerRepository ownerRepository;
    private final PropertyRepository propertyRepository;
    private final UnitRepository unitRepository;
    private final ReservationRepository reservationRepository;
    private final ExternalCalendarRepository calendarRepository;
    private final SyncConflictRepository syncConflictRepository;
    private final EntityManager entityManager;
    private final AuthService authService;
    private final EmailService emailService;
    private final RateLimits rateLimits;
    private final Clock clock;

    // ---------- export ----------

    /**
     * Everything stored for this owner, as plain JSON-ready maps. Left out on purpose: password hashes, code hashes,
     * and the calendar links (RoomTrack's feed tokens and the Booking.com links), which work like passwords.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> export(UUID userId, UUID ownerId) {
        rateLimits.enforce("data-export:" + userId, rateLimits.limits().dataExport());
        AppUser me = appUserRepository.findById(userId).orElseThrow(() -> new NoSuchElementException("User not found"));
        Owner owner = ownerRepository.findById(ownerId).orElseThrow(() -> new NoSuchElementException("Owner not found"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("format", "roomtrack-export-v1");
        out.put("exportedAt", OffsetDateTime.now(clock));
        out.put("note", "Calendar links (RoomTrack feed links and connected Booking.com links) are left out: they work like passwords.");

        Map<String, Object> account = new LinkedHashMap<>();
        account.put("email", me.getEmail());
        account.put("fullName", me.getFullName());
        account.put("contactPhone", owner.getContactPhone());
        account.put("timezone", owner.getTimezone());
        account.put("bookingNotificationsEnabled", owner.isNotificationsEnabled());
        account.put("createdAt", me.getCreatedAt());
        account.put("lastLoginAt", me.getLastLoginAt());
        account.put("emailVerifiedAt", me.getEmailVerifiedAt());
        account.put("termsVersion", me.getTermsVersion());
        account.put("privacyVersion", me.getPrivacyVersion());
        account.put("termsAcceptedAt", me.getTermsAcceptedAt());
        out.put("account", account);

        out.put("users", appUserRepository.findAllByOwnerId(ownerId).stream().map(u -> row(
                "email", u.getEmail(), "fullName", u.getFullName(), "role", u.getRole(), "createdAt", u.getCreatedAt())).toList());

        Map<UUID, List<ExternalCalendar>> calendarsByUnit = calendarRepository.findAllByOwnerId(ownerId).stream()
                .collect(Collectors.groupingBy(ExternalCalendar::getUnitId));
        Map<UUID, List<Unit>> unitsByProperty = unitRepository.findAllByOwnerId(ownerId).stream()
                .collect(Collectors.groupingBy(u -> u.getProperty().getId()));
        List<Map<String, Object>> properties = new ArrayList<>();
        for (Property p : propertyRepository.findAllByOwnerId(ownerId)) {
            List<Map<String, Object>> rooms = unitsByProperty.getOrDefault(p.getId(), List.of()).stream().map(u -> row(
                    "id", u.getId(), "name", u.getName(), "capacity", u.getCapacity(), "createdAt", u.getCreatedAt(),
                    "connectedCalendars", calendarsByUnit.getOrDefault(u.getId(), List.of()).stream().map(c -> row(
                            "platform", c.getPlatform(), "lastSyncedAt", c.getLastSyncedAt(),
                            "lastSuccessAt", c.getLastSuccessAt(), "lastError", c.getLastError())).toList())).toList();
            properties.add(row("id", p.getId(), "name", p.getName(), "address", p.getAddress(),
                    "createdAt", p.getCreatedAt(), "rooms", rooms));
        }
        out.put("properties", properties);

        out.put("reservations", reservationRepository.findAllByOwnerId(ownerId).stream()
                .sorted(Comparator.comparing((Reservation r) -> r.getStayRange().lower()))
                .map(r -> row("id", r.getId(), "roomId", r.getUnit().getId(),
                        "checkIn", r.getStayRange().lower(), "checkOut", r.getStayRange().upper(),
                        "status", r.getStatus(), "source", r.getSource(),
                        "guestName", r.getGuestName(), "guestEmail", r.getGuestEmail(), "guestPhone", r.getGuestPhone(),
                        "guestsCount", r.getGuestsCount(), "pricePerGuest", r.getPricePerGuest(),
                        "nightlyRate", r.getNightlyRate(), "totalAmount", r.getTotalAmount(), "notes", r.getNotes(),
                        "priceNeedsReview", r.isPriceNeedsReview(), "cancelledAt", r.getCancelledAt(),
                        "guestErasedAt", r.getGuestErasedAt(), "createdAt", r.getCreatedAt(), "updatedAt", r.getUpdatedAt()))
                .toList());

        out.put("bookingConflicts", syncConflictRepository.findAllByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .map((SyncConflict c) -> row("id", c.getId(), "roomId", c.getUnitId(), "platform", c.getPlatform(),
                        "incomingStart", c.getIncomingStart(), "incomingEnd", c.getIncomingEnd(),
                        "incomingSummary", c.getIncomingSummary(), "conflictingReservationId", c.getConflictingReservationId(),
                        "kind", c.getKind(), "status", c.getStatus(), "createdAt", c.getCreatedAt(), "resolvedAt", c.getResolvedAt()))
                .toList());

        out.put("emailLog", entityManager.createQuery(
                        "select e from EmailLog e where e.ownerId = :ownerId order by e.createdAt desc", EmailLog.class)
                .setParameter("ownerId", ownerId).getResultList().stream()
                .map(e -> row("to", e.getToAddress(), "type", e.getType(), "subject", e.getSubject(),
                        "status", e.getStatus(), "createdAt", e.getCreatedAt()))
                .toList());
        return out;
    }

    // ---------- deletion ----------

    /**
     * Deletes the owner behind this user, with everything that belongs to it, in one transaction: email log rows
     * (also any still addressed to these users), synced calendar events, booking conflicts, calendars, reservations
     * with their guest details, rooms (and so their feed links), properties, codes, the users and the owner.
     * Every session ends because the users are gone (tokens are also bound to the user id). Needs the password and the
     * typed word DELETE. A confirmation email goes out after commit and is not logged.
     */
    @Transactional
    public void deleteAccount(UUID userId, String password, String confirmation) {
        rateLimits.enforce("account-deletion:" + userId, rateLimits.limits().accountDeletion());
        AppUser user = appUserRepository.findById(userId).orElseThrow(() -> new NoSuchElementException("User not found"));
        // 400, never 401: the frontend signs people out on a 401
        if (!authService.passwordMatches(password, user.getPasswordHash())) {
            throw new VerificationException(VerificationException.WRONG_PASSWORD, "Your password is not correct.");
        }
        if (confirmation == null || !DELETE_CONFIRMATION.equals(confirmation.trim())) {
            throw new IllegalArgumentException("Type DELETE to confirm.");
        }

        UUID ownerId = user.getOwner().getId();
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

        // Ids and counts only: no names, addresses or guest details
        log.info("Account deleted: owner {} ({} users, {} properties, {} rooms, {} reservations, {} email log rows)",
                ownerId, userIds.size(), properties, rooms, reservations, emailLogRows);
        afterCommit(() -> users.forEach(u -> emailService.sendWithoutLog(deletedEmail(u.getEmail()))));
    }

    private int delete(String jpql, Map<String, Object> params) {
        var query = entityManager.createQuery(jpql);
        params.forEach(query::setParameter);
        return query.executeUpdate();
    }

    private static EmailMessage deletedEmail(String to) {
        String subject = "Your RoomTrack account was deleted";
        String text = "Your RoomTrack account (" + to + ") and everything in it were deleted: properties, rooms, "
                + "bookings and guest details, connected calendars and settings. This can't be undone.\n\n"
                + "RoomTrack's calendar links have stopped working. If you added them to Booking.com or another "
                + "platform, remove them there.\n\n"
                + "Copies in our backups are removed when those backups are replaced.\n\n"
                + "If you didn't do this, reply to this email right away.\n";
        String html = "<p>Your RoomTrack account (" + HtmlUtils.htmlEscape(to) + ") and everything in it were deleted: "
                + "properties, rooms, bookings and guest details, connected calendars and settings. This can't be undone.</p>"
                + "<p>RoomTrack's calendar links have stopped working. If you added them to Booking.com or another "
                + "platform, remove them there.</p>"
                + "<p>Copies in our backups are removed when those backups are replaced.</p>"
                + "<p style=\"color:#666;font-size:13px\">If you didn't do this, reply to this email right away.</p>";
        return new EmailMessage(to, subject, html, text);
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        } else {
            action.run();
        }
    }

    /** An ordered map from key/value pairs; unlike Map.of it keeps nulls (an empty phone is part of the export). */
    private static Map<String, Object> row(Object... keyValues) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) m.put((String) keyValues[i], keyValues[i + 1]);
        return m;
    }
}
