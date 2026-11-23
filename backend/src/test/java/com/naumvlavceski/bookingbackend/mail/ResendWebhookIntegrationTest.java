package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.EmailLog;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A2: the Resend webhook is public but only accepts fresh, correctly signed requests. The disabled case (no secret)
 * is {@link ResendWebhookDisabledTest}.
 */
@SpringBootTest(properties = "app.mail.resend-webhook-secret=" + ResendWebhookIntegrationTest.SECRET)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ResendWebhookIntegrationTest {

    /** Obviously fake: "whsec_" + base64("test-only-webhook-key-not-a-secret"). */
    static final String SECRET = "whsec_dGVzdC1vbmx5LXdlYmhvb2sta2V5LW5vdC1hLXNlY3JldA==";

    @Autowired MockMvc mvc;
    @Autowired EmailLogRepository logs;

    private final SvixSignature signer = new SvixSignature(SECRET);

    static String event(String type, String emailId) {
        return "{\"type\":\"" + type + "\",\"created_at\":\"2026-11-22T10:00:00Z\",\"data\":{\"email_id\":\""
                + emailId + "\",\"to\":[\"x@example.test\"],\"subject\":\"s\"}}";
    }

    private ResultActions deliver(String body, long timestamp, boolean validSignature) throws Exception {
        String id = "msg_" + UUID.randomUUID();
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        String sig = validSignature
                ? Base64.getEncoder().encodeToString(signer.sign(id, Long.toString(timestamp), bytes))
                : Base64.getEncoder().encodeToString(new byte[32]);
        return mvc.perform(post("/api/webhooks/resend").contentType(MediaType.APPLICATION_JSON).content(bytes)
                .header("svix-id", id).header("svix-timestamp", Long.toString(timestamp))
                .header("svix-signature", "v1," + sig));
    }

    private EmailLog row(String providerId) {
        return logs.save(EmailLog.of(null, "x@example.test", "TEST", "s", EmailLog.SENT, 1, providerId, null));
    }

    private String statusOf(EmailLog saved) {
        return logs.findById(saved.getId()).orElseThrow().getStatus();
    }

    private static long now() {
        return Instant.now().getEpochSecond();
    }

    @Test
    void validSignatureUpdatesTheStatus() throws Exception {
        String providerId = "re_" + UUID.randomUUID();
        EmailLog saved = row(providerId);
        deliver(event("email.delivered", providerId), now(), true).andExpect(status().isNoContent());
        assertEquals(EmailLog.DELIVERED, statusOf(saved));

        deliver(event("email.bounced", providerId), now(), true).andExpect(status().isNoContent());
        assertEquals(EmailLog.BOUNCED, statusOf(saved));

        // A late "delivered" never hides the bounce
        deliver(event("email.delivered", providerId), now(), true).andExpect(status().isNoContent());
        assertEquals(EmailLog.BOUNCED, statusOf(saved));
    }

    @Test
    void complaintIsRecorded() throws Exception {
        String providerId = "re_" + UUID.randomUUID();
        EmailLog saved = row(providerId);
        deliver(event("email.complained", providerId), now(), true).andExpect(status().isNoContent());
        assertEquals(EmailLog.COMPLAINED, statusOf(saved));
    }

    @Test
    void invalidSignatureIsRejected() throws Exception {
        String providerId = "re_" + UUID.randomUUID();
        EmailLog saved = row(providerId);
        deliver(event("email.complained", providerId), now(), false).andExpect(status().isBadRequest());
        assertEquals(EmailLog.SENT, statusOf(saved));
    }

    @Test
    void expiredTimestampIsRejected() throws Exception {
        String providerId = "re_" + UUID.randomUUID();
        EmailLog saved = row(providerId);
        deliver(event("email.complained", providerId), now() - 6 * 60, true).andExpect(status().isBadRequest());
        assertEquals(EmailLog.SENT, statusOf(saved));
    }

    @Test
    void missingHeadersAreRejectedAndUnknownEventsIgnored() throws Exception {
        mvc.perform(post("/api/webhooks/resend").contentType(MediaType.APPLICATION_JSON)
                .content(event("email.delivered", "re_x"))).andExpect(status().isBadRequest());
        deliver(event("email.opened", "re_x"), now(), true).andExpect(status().isNoContent());
    }
}
