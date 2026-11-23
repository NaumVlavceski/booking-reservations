package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.EmailLog;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Delivery reports from Resend (POST /api/webhooks/resend): public, but every request must carry a valid Svix
 * signature (see {@link SvixSignature}) no older than 5 minutes. Updates email_log.status by Resend's message id
 * (delivered, bounced, complained). With RESEND_WEBHOOK_SECRET empty the endpoint answers 404, as if it did not exist.
 * The request-size limit (RequestSizeLimitFilter) and a per-IP rate limit apply.
 */
@Slf4j
@Hidden
@RestController
public class ResendWebhookController {
    static final String PATH = "/api/webhooks/resend";
    private static final Map<String, String> STATUS_BY_EVENT = Map.of(
            "email.delivered", EmailLog.DELIVERED,
            "email.bounced", EmailLog.BOUNCED,
            "email.complained", EmailLog.COMPLAINED);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final SvixSignature signature;
    private final EmailLogRepository logs;
    private final RateLimits rateLimits;
    private final Clock clock;

    ResendWebhookController(@Value("${app.mail.resend-webhook-secret:}") String secret,
                            EmailLogRepository logs, RateLimits rateLimits, Clock clock) {
        // A malformed secret is a configuration error worth failing the start for; an empty one just turns it off
        this.signature = secret == null || secret.isBlank() ? null : new SvixSignature(secret);
        this.logs = logs;
        this.rateLimits = rateLimits;
        this.clock = clock;
    }

    @PostMapping(PATH)
    @Transactional
    public ResponseEntity<Void> receive(@RequestHeader(value = "svix-id", required = false) String id,
                                        @RequestHeader(value = "svix-timestamp", required = false) String timestamp,
                                        @RequestHeader(value = "svix-signature", required = false) String sig,
                                        @RequestBody(required = false) byte[] body,
                                        HttpServletRequest request) {
        if (signature == null) return ResponseEntity.notFound().build();
        rateLimits.enforce("webhook-ip:" + RateLimits.clientIp(request), rateLimits.limits().webhookPerIp());
        if (!signature.verify(id, timestamp, sig, body, clock.instant())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        JsonNode event;
        try {
            event = JSON.readTree(body);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        String status = STATUS_BY_EVENT.get(event.path("type").asString(""));
        String messageId = event.path("data").path("email_id").asString("");
        // Other event types are acknowledged and ignored, so Resend doesn't keep retrying them
        if (status == null || messageId.isBlank()) return ResponseEntity.noContent().build();

        OffsetDateTime now = OffsetDateTime.now(clock);
        int updated = EmailLog.DELIVERED.equals(status)
                ? logs.markDelivered(messageId, now)
                : logs.updateStatusByProviderId(messageId, status, now);
        if (updated == 0) log.debug("Resend webhook for an unknown message id");
        return ResponseEntity.noContent().build();
    }
}
