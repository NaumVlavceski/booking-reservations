package com.naumvlavceski.bookingbackend.mail;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SvixSignatureTest {
    private static final SvixSignature SIG = new SvixSignature(ResendWebhookIntegrationTest.SECRET);
    private static final byte[] BODY = "{\"type\":\"email.delivered\"}".getBytes(StandardCharsets.UTF_8);
    private static final Instant NOW = Instant.parse("2026-11-22T10:00:00Z");

    private static String header(String id, long ts, byte[] body) {
        return "v1," + Base64.getEncoder().encodeToString(SIG.sign(id, Long.toString(ts), body));
    }

    @Test
    void acceptsAValidSignatureAmongSeveral() {
        long ts = NOW.getEpochSecond();
        assertTrue(SIG.verify("msg_1", Long.toString(ts), "v1,AAAA " + header("msg_1", ts, BODY), BODY, NOW));
    }

    @Test
    void rejectsTamperingAndOldOrFutureTimestamps() {
        long ts = NOW.getEpochSecond();
        String valid = header("msg_1", ts, BODY);
        assertFalse(SIG.verify("msg_2", Long.toString(ts), valid, BODY, NOW), "other id");
        assertFalse(SIG.verify("msg_1", Long.toString(ts), valid, "{}".getBytes(StandardCharsets.UTF_8), NOW), "other body");
        assertFalse(SIG.verify("msg_1", Long.toString(ts), valid.replace("v1,", "v2,"), BODY, NOW), "other version");
        assertFalse(SIG.verify("msg_1", Long.toString(ts - 301), header("msg_1", ts - 301, BODY), BODY, NOW), "too old");
        assertFalse(SIG.verify("msg_1", Long.toString(ts + 301), header("msg_1", ts + 301, BODY), BODY, NOW), "future");
        assertTrue(SIG.verify("msg_1", Long.toString(ts - 299), header("msg_1", ts - 299, BODY), BODY, NOW), "within 5 min");
        assertFalse(SIG.verify(null, Long.toString(ts), valid, BODY, NOW));
        assertFalse(SIG.verify("msg_1", "not-a-number", valid, BODY, NOW));
    }

    @Test
    void aMalformedSecretIsAConfigurationError() {
        assertThrows(IllegalArgumentException.class, () -> new SvixSignature("whsec_***"));
    }
}
