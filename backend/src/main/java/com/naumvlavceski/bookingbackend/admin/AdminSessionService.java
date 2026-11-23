package com.naumvlavceski.bookingbackend.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Admin sessions (table admin_session). The client gets a random 256-bit token once and sends it in
 * {@code X-Admin-Session} next to its normal owner token; only a SHA-256 of it is stored. A session is valid while it
 * is not revoked, not past {@code expires_at} (a 30-minute window, renewed only by an explicit extend), and its user's
 * token_version is still the one it was opened with (an owner logout or password change ends it). The absolute cap
 * {@code max_expires_at} is fixed when the session opens.
 */
@Service
public class AdminSessionService {
    public static final String HEADER = "X-Admin-Session";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final AdminProperties props;

    public AdminSessionService(JdbcTemplate jdbc, Clock clock, AdminProperties props) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.props = props;
    }

    public record Session(UUID id, UUID userId, Instant expiresAt, Instant maxExpiresAt) {}

    public record Opened(String token, Session session) {}

    public Opened open(UUID userId, int tokenVersion) {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Instant now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS); // what Postgres keeps
        Instant max = now.plus(props.sessionMax());
        Instant expires = min(now.plus(props.sessionWindow()), max);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO admin_session (id, user_id, token_hash, token_version, created_at, expires_at, max_expires_at) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?)", id, userId, hash(token), tokenVersion, utc(now), utc(expires), utc(max));
        return new Opened(token, new Session(id, userId, expires, max));
    }

    /** The live session behind this token for this user, or empty (unknown, revoked, expired, other user or version). */
    public Optional<Session> find(String token, UUID userId, int currentTokenVersion) {
        if (token == null || token.isBlank() || token.length() > 100) return Optional.empty();
        List<Session> rows = jdbc.query(
                "SELECT id, user_id, expires_at, max_expires_at FROM admin_session WHERE token_hash = ? AND user_id = ? "
                        + "AND token_version = ? AND revoked_at IS NULL AND expires_at > ?",
                (rs, i) -> new Session(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                        rs.getTimestamp(3).toInstant(), rs.getTimestamp(4).toInstant()),
                hash(token), userId, currentTokenVersion, utc(clock.instant()));
        return rows.stream().findFirst();
    }

    /** One more window, never past the absolute cap. Empty when the session already ends at the cap. */
    public Optional<Session> extend(Session s) {
        Instant now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS); // what Postgres keeps
        Instant next = min(now.plus(props.sessionWindow()), s.maxExpiresAt());
        if (!next.isAfter(s.expiresAt())) return Optional.empty();
        jdbc.update("UPDATE admin_session SET expires_at = ? WHERE id = ? AND revoked_at IS NULL", utc(next), s.id());
        return Optional.of(new Session(s.id(), s.userId(), next, s.maxExpiresAt()));
    }

    public void revoke(UUID sessionId) {
        jdbc.update("UPDATE admin_session SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
                utc(clock.instant()), sessionId);
    }

    /** Owner logout: every admin session of this user ends (token_version binding does this too). */
    public void revokeAll(UUID userId) {
        jdbc.update("UPDATE admin_session SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                utc(clock.instant()), userId);
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
