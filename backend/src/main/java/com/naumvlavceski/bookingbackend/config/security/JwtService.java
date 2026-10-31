package com.naumvlavceski.bookingbackend.config.security;

import com.naumvlavceski.bookingbackend.model.AppUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Clock;
import java.util.Date;
import java.util.Optional;

@Service
public class JwtService {

    static final String SESSION_ISSUED_AT = "sid_iat";
    static final String TOKEN_VERSION = "tv";

    private final Clock clock;

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.idle-timeout-ms}")
    private long idleTimeoutMs;

    @Value("${app.jwt.absolute-timeout-ms}")
    private long absoluteTimeoutMs;

    @Value("${app.jwt.renew-threshold-ratio}")
    private double renewThresholdRatio;

    public JwtService(Clock clock) {
        this.clock = clock;
    }

    @jakarta.annotation.PostConstruct
    void validateSecret() {
        if (secret == null || secret.getBytes().length < 32) {
            throw new IllegalStateException("app.jwt.secret (APP_JWT_SECRET) must be set to at least 32 characters");
        }
        if (idleTimeoutMs <= 0 || absoluteTimeoutMs < idleTimeoutMs) {
            throw new IllegalStateException("app.jwt.idle-timeout-ms must be > 0 and <= app.jwt.absolute-timeout-ms");
        }
        if (renewThresholdRatio <= 0 || renewThresholdRatio >= 1) {
            throw new IllegalStateException("app.jwt.renew-threshold-ratio must be between 0 and 1");
        }
    }

    private SecretKey key() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    public String generateToken(AppUser user) {
        return issue(user, clock.millis());
    }

    public Optional<Claims> parse(String token) {
        try {
            return Optional.of(Jwts.parser().verifyWith(key()).clock(() -> new Date(clock.millis())).build()
                    .parseSignedClaims(token).getPayload());
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    public boolean isSessionValid(Claims claims, AppUser user) {
        // The subject is the email; the user id makes sure a token of a deleted account can't be used by a new
        // account that later registers with the same address.
        if (!user.getId().toString().equals(claims.get("userId", String.class))) return false;
        long sessionStart = sessionIssuedAt(claims);
        if (clock.millis() > sessionStart + absoluteTimeoutMs) return false;
        return tokenVersion(claims) == user.getTokenVersion();
    }

    public Optional<String> renewIfDue(Claims claims, AppUser user) {
        long now = clock.millis();
        long expiresAt = claims.getExpiration().getTime();
        if (expiresAt - now >= idleTimeoutMs * renewThresholdRatio) return Optional.empty();

        long sessionStart = sessionIssuedAt(claims);
        if (Math.min(now + idleTimeoutMs, sessionStart + absoluteTimeoutMs) <= expiresAt) return Optional.empty();
        return Optional.of(issue(user, sessionStart));
    }

    private String issue(AppUser user, long sessionStart) {
        long now = clock.millis();
        long expiry = Math.min(now + idleTimeoutMs, sessionStart + absoluteTimeoutMs);
        return Jwts.builder()
                .subject(user.getEmail())
                .claim("userId", user.getId().toString())
                .claim("ownerId", user.getOwner().getId().toString())
                .claim("role", user.getRole().name())
                .claim(SESSION_ISSUED_AT, sessionStart / 1000)
                .claim(TOKEN_VERSION, user.getTokenVersion())
                .issuedAt(new Date(now))
                .expiration(new Date(expiry))
                .signWith(key())
                .compact();
    }

    private static long sessionIssuedAt(Claims claims) {
        Number seconds = claims.get(SESSION_ISSUED_AT, Number.class);
        if (seconds != null) return seconds.longValue() * 1000;
        Date issuedAt = claims.getIssuedAt();
        return issuedAt != null ? issuedAt.getTime() : 0;
    }

    private static int tokenVersion(Claims claims) {
        Number version = claims.get(TOKEN_VERSION, Number.class);
        return version != null ? version.intValue() : 0;
    }
}
