package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.EmailLog;
import com.naumvlavceski.bookingbackend.util.SafeErrorText;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {
    private final EmailSender sender;
    private final EmailLogRepository logs;

    @Async("mailExecutor")
    public void send(UUID ownerId, String type, EmailMessage msg) {
        Delivery d = deliver(msg);
        if (d != null) record(ownerId, type, msg, d.sent() ? EmailLog.SENT : EmailLog.FAILED,
                d.attempts(), d.providerId(), d.error());
    }

    /**
     * Same delivery, but no email_log row: for the "your account was deleted" email, whose recipient address must
     * not stay behind in the log of an account that no longer exists.
     */
    @Async("mailExecutor")
    public void sendWithoutLog(EmailMessage msg) {
        Delivery d = deliver(msg);
        if (d != null && !d.sent()) log.warn("Unlogged email could not be delivered after {} attempts", d.attempts());
    }

    /**
     * Sends now, on the caller's thread, and says whether it went out; no email_log row. For the contact form, whose
     * visitor should hear whether the message was sent, and whose words should not stay behind in a log.
     */
    public boolean sendNow(EmailMessage msg) {
        Delivery d = deliver(msg);
        if (d == null || !d.sent()) {
            log.warn("Email could not be delivered after {} attempts", d == null ? 0 : d.attempts());
            return false;
        }
        return true;
    }

    /** The outcome of an admin message: whether it went out, and its email_log row (null if the row couldn't be written). */
    public record AdminSend(boolean sent, UUID logId) {}

    /**
     * An email the admin wrote (Send email in the admin panel): sent now, on the caller's thread, and logged as
     * ADMIN_MESSAGE with its plain-text body and the admin's id. The only email type whose content is stored.
     */
    public AdminSend sendAdminMessage(UUID ownerId, UUID adminUserId, EmailMessage msg, String plainBody) {
        Delivery d = deliver(msg);
        boolean sent = d != null && d.sent();
        UUID logId = null;
        try {
            EmailLog row = EmailLog.of(ownerId, msg.to(), EmailLog.ADMIN_MESSAGE, msg.subject(),
                    sent ? EmailLog.SENT : EmailLog.FAILED, d == null ? 0 : d.attempts(),
                    d == null ? null : d.providerId(), d == null ? null : SafeErrorText.of(d.error()));
            row.setBody(plainBody);
            row.setSentByAdminId(adminUserId);
            logId = logs.save(row).getId();
        } catch (Exception e) {
            log.warn("Could not write email_log row: {}", e.toString());
        }
        return new AdminSend(sent, logId);
    }

    private record Delivery(boolean sent, int attempts, String providerId, String error) {}

    /** Up to 3 tries for errors worth retrying; null if the thread was interrupted. */
    private Delivery deliver(EmailMessage msg) {
        int attempt = 0;
        while (true) {
            attempt++;
            try {
                return new Delivery(true, attempt, sender.send(msg), null);
            } catch (Exception e) {
                if (attempt >= 3 || !retryable(e)) return new Delivery(false, attempt, null, e.getMessage());
                try { Thread.sleep(1000L * attempt * attempt); }
                catch (InterruptedException ie) { Thread.currentThread().interrupt(); return null; }
            }
        }
    }

    private boolean retryable(Exception e) {
        if (e instanceof ResourceAccessException) return true;
        if (e instanceof RestClientResponseException r)
            return r.getStatusCode().value() == 429 || r.getStatusCode().is5xxServerError();
        return false;
    }

    private void record(UUID ownerId, String type, EmailMessage m, String status,
                        int attempts, String providerId, String error) {
        // Never the body of an automatic email, never a full error (provider errors can echo links or keys)
        try {
            logs.save(EmailLog.of(ownerId, m.to(), type, m.subject(), status, attempts, providerId,
                    SafeErrorText.of(error)));
        } catch (Exception e) {
            // The email itself is already out (or failed); a log problem must never change that
            log.warn("Could not write email_log row: {}", e.toString());
        }
    }
}