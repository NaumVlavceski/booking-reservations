package com.naumvlavceski.bookingbackend.mail;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * Checks a Resend webhook signature. Resend signs with Svix (checked against resend.com/docs and docs.svix.com on
 * 2026-11-22): headers {@code svix-id}, {@code svix-timestamp} (Unix seconds), {@code svix-signature} (space-separated
 * {@code v1,<base64>} entries); the signed content is {@code id + "." + timestamp + "." + rawBody}; the key is the
 * base64 part of the secret after {@code whsec_}; HMAC-SHA256; constant-time comparison.
 */
public final class SvixSignature {
    public static final Duration TOLERANCE = Duration.ofMinutes(5);

    private final byte[] key;

    public SvixSignature(String secret) {
        String s = secret == null ? "" : secret.trim();
        if (s.startsWith("whsec_")) s = s.substring("whsec_".length());
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(s);
        } catch (IllegalArgumentException e) {
            decoded = new byte[0];
        }
        if (decoded.length == 0) throw new IllegalArgumentException("Webhook secret is not a valid whsec_ value");
        this.key = decoded;
    }

    /** True only for a fresh (within {@link #TOLERANCE}) and correctly signed request. */
    public boolean verify(String id, String timestamp, String signatureHeader, byte[] body, Instant now) {
        if (id == null || id.isBlank() || timestamp == null || signatureHeader == null || body == null) return false;
        long seconds;
        try {
            seconds = Long.parseLong(timestamp.trim());
        } catch (NumberFormatException e) {
            return false;
        }
        Instant sent = Instant.ofEpochSecond(seconds);
        if (sent.isBefore(now.minus(TOLERANCE)) || sent.isAfter(now.plus(TOLERANCE))) return false;

        byte[] expected = sign(id, timestamp.trim(), body);
        for (String part : signatureHeader.trim().split(" ")) {
            int comma = part.indexOf(',');
            if (comma < 0 || !"v1".equals(part.substring(0, comma))) continue;
            byte[] given;
            try {
                given = Base64.getDecoder().decode(part.substring(comma + 1));
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (MessageDigest.isEqual(expected, given)) return true;
        }
        return false;
    }

    /** The raw HMAC (exposed for tests that build signed requests). */
    public byte[] sign(String id, String timestamp, byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            mac.update((id + "." + timestamp + ".").getBytes(StandardCharsets.UTF_8));
            return mac.doFinal(body);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC unavailable");
        }
    }
}
