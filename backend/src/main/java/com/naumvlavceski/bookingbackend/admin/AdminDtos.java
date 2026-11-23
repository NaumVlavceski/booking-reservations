package com.naumvlavceski.bookingbackend.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Everything the admin API returns. Plain records built by hand from SQL rows, never JPA entities. None of them has a
 * field for password hashes, token_version, codes or their hashes, tokens, feed tokens or calendar links (calendars
 * show the host only). Guest phone, guest email and private notes are not part of any list.
 */
public final class AdminDtos {
    private AdminDtos() {}

    public record Counts(long properties, long units, long reservations) {}

    /** One row of the owner list. {@code sync}: NONE (no calendar), OK or FAILING. */
    public record OwnerRow(UUID id, String name, String email, String phone, Instant registeredAt, Instant lastSeenAt,
                           boolean emailVerified, Counts counts, List<String> attention, String sync) {}

    public record FilterCounts(long attention, long all, long inactive14) {}

    public record OwnerPage(List<OwnerRow> items, int page, int size, long totalElements, int totalPages,
                            FilterCounts counts) {}

    public record Reason(String code, String text) {}

    public record OwnerDetail(UUID id, String name, String email, String phone, Instant registeredAt,
                              Instant lastSeenAt, Instant lastLoginAt, boolean emailVerified, Instant emailVerifiedAt,
                              Counts counts, long calendars, long openConflicts, List<Reason> attention) {}

    public record ReservationRow(UUID id, String unit, String property, String guestName, LocalDate checkIn,
                                 LocalDate checkOut, String status, String source, boolean imported,
                                 String calendar, BigDecimal price, boolean importedWithoutPrice,
                                 Instant createdAt, Instant updatedAt) {}

    public record ReservationPage(List<ReservationRow> items, int page, int size, long total, boolean hasMore) {}

    /** {@code host}: only the host of the import link, never the link. */
    public record CalendarRow(UUID id, String platform, String host, Instant lastAttemptAt, Instant lastSuccessAt,
                              Instant lastErrorAt, String lastErrorMessage, int consecutiveFailures,
                              long importedReservations, boolean failing) {}

    /** {@code outgoingFeed}: whether the room has an export feed; never its link or token. */
    public record UnitCalendars(UUID unitId, String unit, String property, boolean outgoingFeed,
                                List<CalendarRow> calendars) {}

    public record EmailRow(UUID id, String type, String status, String subject, String to, Instant createdAt,
                           Instant updatedAt, boolean sentByAdmin, boolean hasBody) {}

    public record EmailPage(List<EmailRow> items, int page, int size, long total, boolean hasMore) {}

    public record EmailBody(UUID id, String subject, String body) {}

    public record Note(UUID id, UUID ownerId, String text, LocalDate remindOn, Instant doneAt, Instant createdAt,
                       Instant updatedAt) {}

    public record Reminder(UUID noteId, UUID ownerId, String ownerName, String ownerEmail, String text,
                           LocalDate remindOn) {}

    public record AuditEntry(UUID id, String action, UUID targetUserId, String targetName,
                             Map<String, Object> details, Instant createdAt) {}

    public record AuditPage(List<AuditEntry> items, int page, int size, long totalElements, int totalPages) {}

    public record FunnelStep(String key, long count, int percent) {}

    public record NeedHelp(long total, Map<String, Long> byReason) {}

    public record Overview(long newOwners7d, long newOwnersPrevious7d, long activeOwners7d, long totalOwners,
                           NeedHelp needHelp, long inactive14, List<OwnerRow> ownersNeedingHelp,
                           List<Reminder> remindersDue, List<FunnelStep> funnel, int finishedSetupPercent,
                           long funnelRegistered, List<AuditEntry> latestActivity, SystemStatus system) {}

    /** {@code state}: OK, WARNING or ERROR; backup fields null when unknown. */
    public record SystemStatus(String state, String appVersion, String flywayVersion, Long databaseBytes,
                               Long diskFreeBytes, Long diskTotalBytes, long emailsFailed24h, long calendarsFailing,
                               String backupState, Instant lastBackupAt, Long lastBackupBytes) {}
}
