package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.exception.TooManyRequestsException;
import com.naumvlavceski.bookingbackend.exception.VerificationException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.EmailLog;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.util.HtmlUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * The admin's second factor: a 6-digit code emailed to the admin's own address, needed for every admin session.
 * Strict on purpose: the code is bound to the user and to the purpose ADMIN_STEP_UP (its keyed hash includes both, and
 * it lives in its own table, so registration and reset codes can never be used here or the other way round); single
 * use; 10 minutes; 5 wrong tries per code; a new code at most every 60 s and 5 per hour; 10 wrong tries in 15 minutes
 * lock the step-up for 15 minutes. Every request, success, failure and lock is audited. The code is never returned,
 * logged or stored (email_log keeps the subject only, which has no code), not even in the "local" profile: to open the
 * panel locally, configure a test sender (MAIL_ENABLED=true with a Resend key).
 */
@Service
public class AdminStepUpService {
    public static final String PURPOSE = "ADMIN_STEP_UP";
    static final Duration TTL = Duration.ofMinutes(10);
    static final int MAX_ATTEMPTS_PER_CODE = 5;
    static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    static final int CODES_PER_HOUR = 5;
    static final int FAILURES_BEFORE_LOCK = 10;
    static final Duration FAILURE_WINDOW = Duration.ofMinutes(15);
    static final Duration LOCK = Duration.ofMinutes(15);
    static final String INVALID_MESSAGE = "That code is not correct or has expired. Check the code or request a new one.";

    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final AppUserRepository users;
    private final EmailService emailService;
    private final AdminAuditService audit;
    private final AdminSessionService sessions;
    private final AdminCodeGenerator generator;
    private final byte[] key;
    /**
     * Development only: the "local" profile with mail off (MailConfig refuses mail off anywhere else). Then no code is
     * emailed or checked; the owner login, is_admin, the session window and the audit log still apply.
     */
    private final boolean devWithoutCode;

    public AdminStepUpService(JdbcTemplate jdbc, Clock clock, AppUserRepository users, EmailService emailService,
                              AdminAuditService audit, AdminSessionService sessions, AdminCodeGenerator generator,
                              @Value("${app.auth.code-secret}") String codeSecret,
                              @Value("#{@mailConfig.logsCodes()}") boolean devWithoutCode) {
        this.devWithoutCode = devWithoutCode;
        this.jdbc = jdbc;
        this.clock = clock;
        this.users = users;
        this.emailService = emailService;
        this.audit = audit;
        this.sessions = sessions;
        this.generator = generator;
        // Derived key: an admin code hash can never be compared with a registration or reset hash
        this.key = ("admin-stepup:" + (codeSecret == null ? "" : codeSecret)).getBytes(StandardCharsets.UTF_8);
    }

    @PostConstruct
    void validate() {
        if (key.length < "admin-stepup:".length() + 32) {
            throw new IllegalStateException("app.auth.code-secret (EMAIL_CODE_SECRET) must be set to at least 32 characters");
        }
    }

    /** Emails a fresh code (older open codes stop working). 429 while locked, within the cooldown or over the hourly limit. */
    @Transactional(noRollbackFor = TooManyRequestsException.class)
    public void requestCode(UUID userId, HttpServletRequest request) {
        AppUser user = users.findById(userId).orElseThrow(() -> new NoSuchElementException("Not found"));
        Instant now = clock.instant();
        requireNotLocked(user.getId(), now);
        if (devWithoutCode) return; // development: nothing to send (see devWithoutCode)

        Instant last = jdbc.query("SELECT max(created_at) FROM admin_stepup_code WHERE user_id = ? AND purpose = ?",
                (rs, i) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(), userId, PURPOSE).getFirst();
        if (last != null && last.plus(RESEND_COOLDOWN).isAfter(now)) {
            throw new TooManyRequestsException(Duration.between(now, last.plus(RESEND_COOLDOWN)).toSeconds() + 1);
        }
        Integer lastHour = jdbc.queryForObject("SELECT count(*) FROM admin_stepup_code WHERE user_id = ? AND purpose = ? "
                + "AND created_at > ?", Integer.class, userId, PURPOSE, utc(now.minus(Duration.ofHours(1))));
        if (lastHour != null && lastHour >= CODES_PER_HOUR) {
            throw new TooManyRequestsException(Duration.ofHours(1).toSeconds());
        }

        String code = generator.next();
        jdbc.update("UPDATE admin_stepup_code SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
                utc(now), userId, PURPOSE);
        jdbc.update("INSERT INTO admin_stepup_code (user_id, code_hash, purpose, created_at, expires_at, attempts) "
                + "VALUES (?, ?, ?, ?, ?, 0)", userId, hash(userId, PURPOSE, code), PURPOSE, utc(now), utc(now.plus(TTL)));
        audit.record(userId, AdminAuditService.STEPUP_REQUESTED, null, null, request);

        String to = user.getEmail();
        UUID ownerId = user.getOwner().getId();
        afterCommit(() -> emailService.send(ownerId, EmailLog.ADMIN_STEP_UP, email(to, code)));
    }

    /**
     * Checks the code and opens an admin session. Wrong, expired, used or missing codes all give the same
     * INVALID_CODE answer; failures are counted and kept even though the call throws.
     */
    @Transactional(noRollbackFor = {VerificationException.class, TooManyRequestsException.class})
    public AdminSessionService.Opened verifyCode(UUID userId, String rawCode, HttpServletRequest request) {
        AppUser user = users.findById(userId).orElseThrow(() -> new NoSuchElementException("Not found"));
        Instant now = clock.instant();
        requireNotLocked(userId, now);
        if (devWithoutCode) {
            AdminSessionService.Opened opened = sessions.open(userId, user.getTokenVersion());
            audit.record(userId, AdminAuditService.SESSION_STARTED, null,
                    Map.of("session", opened.session().id(), "withoutCode", true), request);
            return opened;
        }
        String code = rawCode == null ? "" : rawCode.trim();

        List<Map<String, Object>> open = jdbc.queryForList(
                "SELECT id, code_hash, expires_at, attempts FROM admin_stepup_code WHERE user_id = ? AND purpose = ? "
                        + "AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE", userId, PURPOSE);
        if (open.isEmpty()) {
            hash(userId, PURPOSE, code); // similar work either way
            throw failure(userId, now, request);
        }
        Map<String, Object> row = open.getFirst();
        UUID codeId = (UUID) row.get("id");
        Instant expires = ((java.sql.Timestamp) row.get("expires_at")).toInstant();
        int attempts = ((Number) row.get("attempts")).intValue();
        boolean matches = MessageDigest.isEqual(
                ((String) row.get("code_hash")).getBytes(StandardCharsets.UTF_8),
                hash(userId, PURPOSE, code).getBytes(StandardCharsets.UTF_8));

        if (!expires.isAfter(now) || attempts >= MAX_ATTEMPTS_PER_CODE || !matches) {
            int nextAttempts = attempts + 1;
            // The 5th wrong try uses the code up
            jdbc.update("UPDATE admin_stepup_code SET attempts = ?, consumed_at = CASE WHEN ? THEN ? ELSE consumed_at END "
                    + "WHERE id = ?", nextAttempts, nextAttempts >= MAX_ATTEMPTS_PER_CODE || !expires.isAfter(now),
                    utc(now), codeId);
            throw failure(userId, now, request);
        }

        jdbc.update("UPDATE admin_stepup_code SET consumed_at = ? WHERE id = ?", utc(now), codeId);
        jdbc.update("UPDATE app_user SET admin_stepup_failed_attempts = 0, admin_stepup_locked_until = NULL WHERE id = ?", userId);
        AdminSessionService.Opened opened = sessions.open(userId, user.getTokenVersion());
        audit.record(userId, AdminAuditService.SESSION_STARTED, null, Map.of("session", opened.session().id()), request);
        return opened;
    }

    private void requireNotLocked(UUID userId, Instant now) {
        Instant until = jdbc.query("SELECT admin_stepup_locked_until FROM app_user WHERE id = ?",
                (rs, i) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(), userId).getFirst();
        if (until != null && until.isAfter(now)) {
            throw new TooManyRequestsException(Duration.between(now, until).toSeconds() + 1);
        }
    }

    /** Records one wrong try; the 10th within 15 minutes locks the step-up. Returns the exception to throw. */
    private RuntimeException failure(UUID userId, Instant now, HttpServletRequest request) {
        audit.record(userId, AdminAuditService.STEPUP_FAILED, null, null, request);
        Integer recent = jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE admin_user_id = ? AND action = ? "
                + "AND created_at > ?", Integer.class, userId, AdminAuditService.STEPUP_FAILED, utc(now.minus(FAILURE_WINDOW)));
        int failures = recent == null ? 0 : recent;
        jdbc.update("UPDATE app_user SET admin_stepup_failed_attempts = ? WHERE id = ?", failures, userId);
        if (failures >= FAILURES_BEFORE_LOCK) {
            jdbc.update("UPDATE app_user SET admin_stepup_locked_until = ? WHERE id = ?", utc(now.plus(LOCK)), userId);
            jdbc.update("UPDATE admin_stepup_code SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL",
                    utc(now), userId);
            audit.record(userId, AdminAuditService.STEPUP_LOCKED, null, Map.of("minutes", LOCK.toMinutes()), request);
            return new TooManyRequestsException(LOCK.toSeconds());
        }
        return new VerificationException(VerificationException.INVALID_CODE, INVALID_MESSAGE);
    }

    /** Keyed hash bound to the user and the purpose. */
    String hash(UUID userId, String purpose, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((purpose + ":" + userId + ":" + code)
                    .getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC unavailable");
        }
    }

    /** False only in development without mail, where the panel opens without an emailed code. */
    public boolean codeRequired() {
        return !devWithoutCode;
    }

    /** Same wording style as the registration code. The subject (logged) carries no code. */
    static EmailMessage email(String to, String code) {
        String subject = "Your RoomTrack admin code";
        String text = "Your RoomTrack admin code is: " + code + "\n\n"
                + "It expires in 10 minutes and works once.\n"
                + "If you did not try to open the Admin Panel, change your password now.\n";
        String html = "<p>Your RoomTrack admin code is:</p>"
                + "<p style=\"font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0\">"
                + HtmlUtils.htmlEscape(code) + "</p>"
                + "<p>It expires in 10 minutes and works once.</p>"
                + "<p style=\"color:#666;font-size:13px\">If you did not try to open the Admin Panel, change your password now.</p>";
        return new EmailMessage(to, subject, html, text);
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        } else {
            action.run();
        }
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
