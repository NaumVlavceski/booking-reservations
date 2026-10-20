package com.naumvlavceski.bookingbackend.service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;

/**
 * The emailed 6-digit codes shared by email verification and password reset: generation, a keyed hash
 * bound to the user, and a constant-time check. Codes are never stored, only their hashes.
 */
public final class OneTimeCodes {
    private static final SecureRandom RANDOM = new SecureRandom();

    private final byte[] secret;

    public OneTimeCodes(String secret) {
        this.secret = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    }

    public boolean secretTooShort() {
        return secret.length < 32;
    }

    public String generate() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    /** Keyed hash of the code, bound to the user so one user's hash can't be replayed for another. */
    public String hash(UUID userId, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((userId + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC unavailable");
        }
    }

    public boolean matches(String storedHash, UUID userId, String rawCode) {
        return MessageDigest.isEqual(
                storedHash.getBytes(StandardCharsets.UTF_8),
                hash(userId, rawCode == null ? "" : rawCode.trim()).getBytes(StandardCharsets.UTF_8));
    }

    /** Same amount of hashing as a real check, for addresses that have no account. */
    public void burn(String rawCode) {
        hash(new UUID(0, 0), rawCode == null ? "" : rawCode);
    }
}
