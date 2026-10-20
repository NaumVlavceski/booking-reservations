package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.exception.VerificationException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.PasswordReset;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimiter;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.PasswordResetRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.util.HtmlUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

/**
 * "Forgot password": email a 6-digit code, trade the right code for a short-lived reset token, then trade
 * the token for a new password. Codes and tokens are never stored or logged (except the clearly marked
 * dev-only line when mail is disabled), and no answer reveals whether an address has an account.
 */
@Slf4j
@Service
public class PasswordResetService {
    public static final String RESET_EMAIL_TYPE = "PASSWORD_RESET";
    public static final String CHANGED_EMAIL_TYPE = "PASSWORD_CHANGED";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration HOUR = Duration.ofHours(1);

    private final AppUserRepository users;
    private final PasswordResetRepository resets;
    private final EmailService emailService;
    private final PasswordEncoder passwordEncoder;
    private final RateLimiter rateLimiter;
    private final Clock clock;
    private final OneTimeCodes oneTimeCodes;
    private final boolean mailEnabled;
    private final Duration codeTtl;
    private final Duration tokenTtl;
    private final int maxAttempts;
    private final Duration resendCooldown;
    private final int requestsPerHour;

    @Autowired
    public PasswordResetService(AppUserRepository users,
                                PasswordResetRepository resets,
                                EmailService emailService,
                                PasswordEncoder passwordEncoder,
                                RateLimiter rateLimiter,
                                Clock clock,
                                @Value("${app.auth.code-secret}") String secret,
                                @Value("${app.mail.enabled:false}") boolean mailEnabled,
                                @Value("${app.auth.reset-code-ttl-minutes:10}") int codeTtlMinutes,
                                @Value("${app.auth.reset-token-ttl-minutes:10}") int tokenTtlMinutes,
                                @Value("${app.auth.code-max-attempts:5}") int maxAttempts,
                                @Value("${app.auth.resend-cooldown-seconds:60}") int cooldownSeconds,
                                @Value("${app.auth.codes-per-hour:5}") int requestsPerHour) {
        this.users = users;
        this.resets = resets;
        this.emailService = emailService;
        this.passwordEncoder = passwordEncoder;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
        this.oneTimeCodes = new OneTimeCodes(secret);
        this.mailEnabled = mailEnabled;
        this.codeTtl = Duration.ofMinutes(codeTtlMinutes);
        this.tokenTtl = Duration.ofMinutes(tokenTtlMinutes);
        this.maxAttempts = maxAttempts;
        this.resendCooldown = Duration.ofSeconds(cooldownSeconds);
        this.requestsPerHour = requestsPerHour;
    }

    /**
     * Emails a code if the address belongs to an active, verified account and the limits allow it.
     * Always returns quietly, so the response never reveals whether the address is registered.
     */
    @Transactional
    public void requestReset(String rawEmail) {
        String email = normalize(rawEmail);
        // Keyed on what was typed, not on the account, so these limits behave the same for unknown addresses
        if (!rateLimiter.tryAcquire("reset-cooldown:" + email, 1, resendCooldown)) return;
        if (!rateLimiter.tryAcquire("reset-hourly:" + email, requestsPerHour, HOUR)) return;

        Optional<AppUser> found = users.findFirstByEmailIgnoreCase(email);
        if (found.isEmpty() || !eligible(found.get())) {
            oneTimeCodes.burn(""); // similar work for unknown addresses
            return;
        }
        AppUser user = found.get();

        // Same limits again from the database: they survive a restart, the in-memory ones do not
        Instant now = clock.instant();
        Optional<PasswordReset> last = resets.findFirstByUserIdOrderByCreatedAtDesc(user.getId());
        if (last.isPresent() && last.get().getCreatedAt().plus(resendCooldown).isAfter(now)) return;
        if (resets.countByUserIdAndCreatedAtAfter(user.getId(), now.minus(HOUR)) >= requestsPerHour) return;

        String code = oneTimeCodes.generate();
        resets.invalidateOpen(user.getId(), now);
        PasswordReset r = new PasswordReset();
        r.setUserId(user.getId());
        r.setCodeHash(oneTimeCodes.hash(user.getId(), code));
        r.setCodeExpiresAt(now.plus(codeTtl));
        r.setCreatedAt(now);
        resets.save(r);

        afterCommit(() -> sendCode(user, code));
    }

    /**
     * Checks the code and, if right, returns a one-time reset token. Every failure (unknown address, wrong,
     * expired, already used, too many attempts) is the same error. Wrong guesses are counted and kept even
     * though the call then throws (hence noRollbackFor).
     */
    @Transactional(noRollbackFor = VerificationException.class)
    public String verifyCode(String rawEmail, String rawCode) {
        Optional<AppUser> found = users.findFirstByEmailIgnoreCase(normalize(rawEmail));
        if (found.isEmpty() || !eligible(found.get())) {
            oneTimeCodes.burn(rawCode);
            throw invalidCode();
        }
        AppUser user = found.get();

        Optional<PasswordReset> open =
                resets.findFirstByUserIdAndUsedAtIsNullAndResetTokenHashIsNullOrderByCreatedAtDesc(user.getId());
        Instant now = clock.instant();
        if (open.isEmpty() || !open.get().getCodeExpiresAt().isAfter(now) || open.get().getAttempts() >= maxAttempts) {
            oneTimeCodes.burn(rawCode);
            throw invalidCode();
        }
        PasswordReset r = open.get();

        if (!oneTimeCodes.matches(r.getCodeHash(), user.getId(), rawCode)) {
            r.setAttempts(r.getAttempts() + 1);
            resets.save(r);
            throw invalidCode();
        }

        // The code is spent from here on: only the token (handed out once, kept only as a hash) moves on
        String token = newToken();
        r.setResetTokenHash(sha256(token));
        r.setResetTokenExpiresAt(now.plus(tokenTtl));
        resets.save(r);
        return token;
    }

    /**
     * Sets the new password, spends the token and ends every existing session, all in one transaction.
     * The password rules are checked on the request (same {@code @ValidPassword} as registration).
     */
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        Instant now = clock.instant();
        PasswordReset r = resets.findByResetTokenHash(sha256(rawToken == null ? "" : rawToken.trim()))
                .filter(x -> x.getUsedAt() == null && x.getResetTokenExpiresAt() != null
                        && x.getResetTokenExpiresAt().isAfter(now))
                .orElseThrow(PasswordResetService::invalidToken);
        AppUser user = users.findById(r.getUserId())
                .filter(this::eligible)
                .orElseThrow(PasswordResetService::invalidToken);

        r.setUsedAt(now);
        resets.save(r);
        users.changePasswordAndRevokeSessions(user.getId(), passwordEncoder.encode(newPassword),
                LocalDateTime.ofInstant(now, ZoneId.systemDefault()));
        resets.invalidateOpen(user.getId(), now); // any other open request is pointless now

        notifyPasswordChanged(user);
    }

    /** Sends "Your password was changed" once the surrounding transaction commits (also used by change password). */
    public void notifyPasswordChanged(AppUser user) {
        afterCommit(() -> sendChanged(user));
    }

    private boolean eligible(AppUser user) {
        // Only verified accounts (every account from before verification existed was marked verified)
        return user.isActive() && user.getEmailVerifiedAt() != null;
    }

    private static VerificationException invalidCode() {
        return new VerificationException(VerificationException.INVALID_CODE, "Invalid or expired code");
    }

    private static VerificationException invalidToken() {
        return new VerificationException(VerificationException.RESET_TOKEN_INVALID,
                "This password reset has expired. Please start again.");
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** A plain hash is enough here: the token is 256 random bits, so there is nothing to guess or precompute. */
    private static String sha256(String token) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable");
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

    private void sendCode(AppUser user, String code) {
        if (!mailEnabled) {
            // Local development only: there is no mail provider to read the code from
            log.info("[DEV ONLY] Password reset code for {}: {}", user.getEmail(), code);
        }
        String ttlText = codeTtl.toMinutes() + " minutes";
        String subject = "Your RoomTrack password reset code";
        String text = "Your RoomTrack password reset code is: " + code + "\n\n"
                + "It expires in " + ttlText + ".\n"
                + "If you did not request this, you can ignore this email.\n";
        String html = "<p>Your RoomTrack password reset code is:</p>"
                + "<p style=\"font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0\">"
                + HtmlUtils.htmlEscape(code) + "</p>"
                + "<p>It expires in " + HtmlUtils.htmlEscape(ttlText) + ".</p>"
                + "<p style=\"color:#666;font-size:13px\">If you did not request this, you can ignore this email.</p>";
        emailService.send(user.getOwner().getId(), RESET_EMAIL_TYPE, new EmailMessage(user.getEmail(), subject, html, text));
    }

    private void sendChanged(AppUser user) {
        String subject = "Your RoomTrack password was changed";
        String text = "The password for your RoomTrack account (" + user.getEmail() + ") was just changed, "
                + "and it was signed out on your other devices.\n\n"
                + "If this wasn't you, reply to this email right away so we can help secure your account.\n";
        String html = "<p>The password for your RoomTrack account (" + HtmlUtils.htmlEscape(user.getEmail())
                + ") was just changed, and it was signed out on your other devices.</p>"
                + "<p style=\"color:#666;font-size:13px\">If this wasn't you, reply to this email right away "
                + "so we can help secure your account.</p>";
        emailService.send(user.getOwner().getId(), CHANGED_EMAIL_TYPE, new EmailMessage(user.getEmail(), subject, html, text));
    }
}
