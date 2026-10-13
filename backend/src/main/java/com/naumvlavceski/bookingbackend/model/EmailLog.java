package com.naumvlavceski.bookingbackend.model;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Data
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EmailLog {
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
    @Column(insertable = false, updatable = false)
    private OffsetDateTime createdAt;

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
