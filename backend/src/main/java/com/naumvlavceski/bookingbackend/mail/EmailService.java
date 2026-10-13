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
        int attempt = 0;
        while (true) {
            attempt++;
            try {
                String id = sender.send(msg);
                record(ownerId, type, msg, "SENT", attempt, id, null);
                return;
            } catch (Exception e) {
                if (attempt >= 3 || !retryable(e)) {
                    record(ownerId, type, msg, "FAILED", attempt, null, e.getMessage());
                    return;
                }
                try { Thread.sleep(1000L * attempt * attempt); }
                catch (InterruptedException ie) { Thread.currentThread().interrupt(); return; }
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