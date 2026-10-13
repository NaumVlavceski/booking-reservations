package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.exception.VerificationException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.EmailVerification;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.EmailVerificationRepository;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/**
 * Issues and checks the 6-digit code that proves a user owns their email address.
 * The code itself is never stored or logged (except the clearly marked dev-only line when mail is disabled).
 */
@Slf4j
@Service
public class EmailVerificationService {
    public static final String EMAIL_TYPE = "VERIFY_EMAIL";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppUserRepository users;
    private final EmailVerificationRepository codes;
    private final EmailService emailService;
    private final Clock clock;
    private final byte[] secret;
    private final boolean mailEnabled;
    private final Duration ttl;
    private final int maxAttempts;
    private final Duration resendCooldown;
    private final int codesPerHour;

    @Autowired
    public EmailVerificationService(AppUserRepository users,
                                    EmailVerificationRepository codes,
                                    EmailService emailService,
                                    Clock clock,
                                    @Value("${app.auth.code-secret}") String secret,
                                    @Value("${app.mail.enabled:false}") boolean mailEnabled,
                                    @Value("${app.auth.code-ttl-minutes:15}") int ttlMinutes,
                                    @Value("${app.auth.code-max-attempts:5}") int maxAttempts,
                                    @Value("${app.auth.resend-cooldown-seconds:60}") int cooldownSeconds,
                                    @Value("${app.auth.codes-per-hour:5}") int codesPerHour) {
        this.users = users;
        this.codes = codes;
        this.emailService = emailService;
        this.clock = clock;
        this.secret = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
        this.mailEnabled = mailEnabled;
        this.ttl = Duration.ofMinutes(ttlMinutes);
        this.maxAttempts = maxAttempts;
        this.resendCooldown = Duration.ofSeconds(cooldownSeconds);
        this.codesPerHour = codesPerHour;
    }

    @PostConstruct
    void validateSecret() {
        if (secret.length < 32) {
            throw new IllegalStateException("app.auth.code-secret (EMAIL_CODE_SECRET) must be set to at least 32 characters");
        }
    }

    /** Creates a fresh code (invalidating older ones) and emails it. No rate limits here: callers decide. */
    @Transactional
    public void issueAndSend(AppUser user) {
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        Instant now = clock.instant();

        codes.invalidateOpen(user.getId(), now);
        EmailVerification v = new EmailVerification();
        v.setUserId(user.getId());
        v.setCodeHash(hash(user.getId(), code));
        v.setCreatedAt(now);
        v.setExpiresAt(now.plus(ttl));
        codes.save(v);

        afterCommit(() -> deliver(user, code));
    }

    /**
     * Sends a new code if the address belongs to an unverified account and the cooldown / hourly limit allow it.
     * Always returns quietly, so the response never reveals whether the address is registered.
     */
    @Transactional
    public void resend(String rawEmail) {
        Optional<AppUser> found = users.findFirstByEmailIgnoreCase(normalize(rawEmail));
        if (found.isEmpty()) return;
        AppUser user = found.get();
        if (!user.isActive() || user.getEmailVerifiedAt() != null) return;

        Instant now = clock.instant();
        Optional<EmailVerification> last = codes.findFirstByUserIdOrderByCreatedAtDesc(user.getId());
        if (last.isPresent() && last.get().getCreatedAt().plus(resendCooldown).isAfter(now)) return;
        if (codes.countByUserIdAndCreatedAtAfter(user.getId(), now.minus(Duration.ofHours(1))) >= codesPerHour) return;

        issueAndSend(user);
    }

    /**
     * Checks the code and, if right, marks the address verified. Wrong guesses are counted and kept
     * even though the call then throws (hence noRollbackFor).
     */
    @Transactional(noRollbackFor = VerificationException.class)
    public AppUser verify(String rawEmail, String rawCode) {
        Optional<AppUser> found = users.findFirstByEmailIgnoreCase(normalize(rawEmail));
        if (found.isEmpty() || !found.get().isActive() || found.get().getEmailVerifiedAt() != null) {
            hash(new UUID(0, 0), rawCode == null ? "" : rawCode); // similar work for unknown emails
            throw invalid();
        }
        AppUser user = found.get();

        Optional<EmailVerification> open = codes.findFirstByUserIdAndConsumedAtIsNullOrderByCreatedAtDesc(user.getId());
        if (open.isEmpty()) throw invalid();
        EmailVerification v = open.get();

        Instant now = clock.instant();
        if (!v.getExpiresAt().isAfter(now)) {
            throw new VerificationException(VerificationException.CODE_EXPIRED,
                    "This code has expired. Request a new one.");
        }
        if (v.getAttempts() >= maxAttempts) throw tooMany();

        boolean match = MessageDigest.isEqual(
                v.getCodeHash().getBytes(StandardCharsets.UTF_8),
                hash(user.getId(), rawCode == null ? "" : rawCode.trim()).getBytes(StandardCharsets.UTF_8));
        if (!match) {
            v.setAttempts(v.getAttempts() + 1);
            codes.save(v);
            if (v.getAttempts() >= maxAttempts) throw tooMany();
            int left = maxAttempts - v.getAttempts();
            throw new VerificationException(VerificationException.INVALID_CODE,
                    "That code is not correct. " + left + (left == 1 ? " attempt" : " attempts") + " left.");
        }

        v.setConsumedAt(now);
        codes.save(v);
        user.setEmailVerifiedAt(OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
        return users.save(user);
    }

    private static VerificationException invalid() {
        return new VerificationException(VerificationException.INVALID_CODE,
                "That code is not correct or has expired. Check the code or request a new one.");
    }

    private static VerificationException tooMany() {
        return new VerificationException(VerificationException.TOO_MANY_ATTEMPTS,
                "Too many wrong attempts. Request a new code.");
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    /** Keyed hash of the code, bound to the user so one user's hash can't be replayed for another. */
    private String hash(UUID userId, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((userId + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC unavailable");
        }
    }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        } else {
            action.run();
        }
    }

    private void deliver(AppUser user, String code) {
        if (!mailEnabled) {
            // Local development only: there is no mail provider to read the code from
            log.info("[DEV ONLY] Email verification code for {}: {}", user.getEmail(), code);
        }
        String ttlText = ttl.toMinutes() + " minutes";
        String subject = "Your RoomTrack verification code";
        String text = "Your RoomTrack verification code is: " + code + "\n\n"
                + "It expires in " + ttlText + ".\n"
                + "If you did not sign up for RoomTrack, you can ignore this email.\n";
        String html = "<p>Your RoomTrack verification code is:</p>"
                + "<p style=\"font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0\">"
                + HtmlUtils.htmlEscape(code) + "</p>"
                + "<p>It expires in " + HtmlUtils.htmlEscape(ttlText) + ".</p>"
                + "<p style=\"color:#666;font-size:13px\">If you did not sign up for RoomTrack, you can ignore this email.</p>";
        emailService.send(user.getOwner().getId(), EMAIL_TYPE, new EmailMessage(user.getEmail(), subject, html, text));
    }
}
