package com.naumvlavceski.bookingbackend.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

/**
 * Signed, login-free unsubscribe links. The token is the owner id plus an HMAC, so it cannot be
 * forged or used for another owner. It never expires: an unsubscribe link in an old email must keep working.
 */
@Component
public class UnsubscribeLinks {
    private static final String PATH = "/api/notifications/unsubscribe";
    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();

    private final byte[] key;
    private final String baseUrl;

    UnsubscribeLinks(@Value("${app.jwt.secret}") String secret,
                     @Value("${app.public-api-url}") String baseUrl) {
        // Derived, so a leaked unsubscribe token can never double as anything JWT-related
        this.key = ("unsubscribe:" + secret).getBytes(StandardCharsets.UTF_8);
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    public String url(UUID ownerId) {
        return baseUrl + PATH + "?token=" + token(ownerId);
    }

    String token(UUID ownerId) {
        String id = ENC.encodeToString(ownerId.toString().getBytes(StandardCharsets.UTF_8));
        return id + "." + ENC.encodeToString(mac(id));
    }

    public Optional<UUID> verify(String token) {
        try {
            if (token == null) return Optional.empty();
            int dot = token.indexOf('.');
            if (dot < 1) return Optional.empty();
            String id = token.substring(0, dot);
            if (!MessageDigest.isEqual(mac(id), DEC.decode(token.substring(dot + 1)))) return Optional.empty();
            return Optional.of(UUID.fromString(new String(DEC.decode(id), StandardCharsets.UTF_8)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private byte[] mac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
