package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.EmailLog;
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
        if (d != null) record(ownerId, type, msg, d.sent() ? "SENT" : "FAILED", d.attempts(), d.providerId(), d.error());
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
        try {
            logs.save(EmailLog.of(ownerId, m.to(), type, m.subject(), status, attempts, providerId,
                    error == null ? null : error.substring(0, Math.min(error.length(), 1000))));
        } catch (Exception e) {
            log.warn("Could not write email_log row", e);
        }
    }
}