package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One sent (or failed) email. Column names predate the admin panel: {@code ownerId} is the owner the email belongs to,
 * {@code toAddress} the recipient, {@code providerId} Resend's message id, {@code error} a short, sanitised reason.
 * {@code body} is only ever filled for {@link #ADMIN_MESSAGE}; automatic emails never store their content.
 */
@Entity
@Data
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EmailLog {
    public static final String QUEUED = "QUEUED";
    public static final String SENT = "SENT";
    public static final String FAILED = "FAILED";
    public static final String DELIVERED = "DELIVERED";
    public static final String BOUNCED = "BOUNCED";
    public static final String COMPLAINED = "COMPLAINED";

    /** Types written by the admin panel (Batch B / C). Every other type is an automatic email. */
    public static final String ADMIN_STEP_UP = "ADMIN_STEP_UP";
    public static final String ADMIN_MESSAGE = "ADMIN_MESSAGE";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private UUID ownerId;
    private String toAddress;
    private String type;
    private String subject;
    private String status;
    private int attempts;
    private String providerId;
    private String error;
    /** Only for ADMIN_MESSAGE. */
    private String body;
    private UUID sentByAdminId;
    @Column(insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public static EmailLog of(UUID ownerId, String to, String type, String subject,
                              String status, int attempts, String providerId, String error) {
        var e = new EmailLog();
        e.ownerId = ownerId;
        e.toAddress = to;
        e.type = type;
        e.subject = subject;
        e.status = status;
        e.attempts = attempts;
        e.providerId = providerId;
        e.error = error;
        return e;
    }
}
