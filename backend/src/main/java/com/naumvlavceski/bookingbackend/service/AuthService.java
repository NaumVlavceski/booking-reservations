package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.AuthResponse;
import com.naumvlavceski.bookingbackend.dto.LoginRequest;
import com.naumvlavceski.bookingbackend.dto.MeResponse;
import com.naumvlavceski.bookingbackend.dto.RegisterRequest;
import com.naumvlavceski.bookingbackend.dto.RegistrationResponse;
import com.naumvlavceski.bookingbackend.dto.VerifyEmailRequest;
import com.naumvlavceski.bookingbackend.exception.EmailNotVerifiedException;
import com.naumvlavceski.bookingbackend.exception.VerificationException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimitProperties.Limit;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimiter;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.model.Role;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.config.security.JwtService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {
    public static final String ALREADY_REGISTERED_EMAIL_TYPE = "ALREADY_REGISTERED";
    /** BCrypt only reads 72 bytes and Spring's encoder refuses more. */
    private static final int BCRYPT_MAX_BYTES = 72;
    private static final Duration NOTICE_COOLDOWN = Duration.ofHours(1);

    private final OwnerRepository ownerRepository;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailVerificationService verificationService;
    private final PasswordResetService passwordResetService;
    private final RateLimits rateLimits;
    private final RateLimiter rateLimiter;
    private final EmailService emailService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /** Checked against for unknown addresses, so they take as long as a wrong password for a real one. */
    private String dummyHash;

    @PostConstruct
    void prepareDummyHash() {
        dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found"));
        return new MeResponse(user.getEmail(), user.getFullName(),
                user.getTermsVersion(), user.getPrivacyVersion(), user.getTermsAcceptedAt());
    }

    /**
     * The answer never says whether the address already has an account. A new address gets an account and a code.
     * An existing, unverified one gets a fresh code (normal resend limits). An existing, verified one gets an email
     * pointing to sign-in and password reset; nothing about that account changes. Every path does one BCrypt hash.
     */
    @Transactional
    public RegistrationResponse register(RegisterRequest request) {
        String email = RateLimits.email(request.email());
        Optional<AppUser> existing = appUserRepository.findFirstByEmailIgnoreCase(email);
        if (existing.isPresent()) {
            passwordEncoder.encode(request.password()); // the same work as a real sign-up
            AppUser user = existing.get();
            if (user.isActive() && user.getEmailVerifiedAt() == null) verificationService.resend(email);
            else if (user.isActive()) sendAlreadyRegisteredNotice(user);
            return new RegistrationResponse(email, true);
        }

        Owner owner = new Owner();
        owner.setContactPhone(request.contactPhone());
        owner.setActive(true);
        owner = ownerRepository.save(owner);

        AppUser user = new AppUser();
        user.setOwner(owner);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFullName(request.fullName());
        user.setRole(Role.OWNER);
        user.setTermsAcceptedAt(OffsetDateTime.now(ZoneOffset.UTC));
        user.setTermsVersion(request.termsVersion());
        user.setPrivacyVersion(request.privacyVersion());
        user = appUserRepository.save(user);

        // No token yet: the address must be verified with the emailed code first
        verificationService.issueAndSend(user);
        return new RegistrationResponse(user.getEmail(), true);
    }

    public AuthResponse verifyEmail(VerifyEmailRequest request) {
        AppUser user = verificationService.verify(request.email(), request.code());
        return signIn(user);
    }

    /**
     * Failed tries are counted per account and per IP (app.rate-limit.login-failures-*). Once either limit is
     * reached every try is refused, even with the right password, until the window moves on: temporary, never a
     * permanent lock. Unknown addresses and wrong passwords get the same answer after the same BCrypt work.
     */
    public AuthResponse login(LoginRequest request, String clientIp) {
        String email = RateLimits.email(request.email());
        Limit perAccount = rateLimits.limits().loginFailuresPerAccount();
        Limit perIp = rateLimits.limits().loginFailuresPerIp();
        String accountKey = "login-fail-email:" + email;
        String ipKey = "login-fail-ip:" + clientIp;
        rateLimits.requireBelow(accountKey, perAccount);
        rateLimits.requireBelow(ipKey, perIp);

        Optional<AppUser> found = appUserRepository.findFirstByEmailIgnoreCase(email);
        boolean passwordOk = passwordMatches(request.password(), found.map(AppUser::getPasswordHash).orElse(dummyHash));
        if (found.isEmpty() || !passwordOk) {
            rateLimits.record(accountKey, perAccount);
            rateLimits.record(ipKey, perIp);
            throw new BadCredentialsException("Invalid email or password");
        }
        AppUser user = found.get();

        if (!user.isActive()) {
            throw new BadCredentialsException("Account is disabled");
        }

        if (user.getEmailVerifiedAt() == null) {
            throw new EmailNotVerifiedException(user.getEmail());
        }

        return signIn(user);
    }

    /**
     * Changes the password of a signed-in user who knows the current one. Every other session ends
     * (token version bumped); the returned token keeps this device signed in.
     */
    @Transactional
    public AuthResponse changePassword(UUID userId, String currentPassword, String newPassword) {
        // Counts every try, so a stolen session can't be used to guess the current password
        rateLimits.enforce("change-password:" + userId, rateLimits.limits().changePassword());
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found"));
        // 400, never 401: the frontend signs people out on a 401
        if (!passwordMatches(currentPassword, user.getPasswordHash())) {
            throw new VerificationException(VerificationException.WRONG_PASSWORD, "Your current password is not correct.");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Choose a new password that is different from your current one.");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setTokenVersion(user.getTokenVersion() + 1);
        user = appUserRepository.save(user);
        passwordResetService.notifyPasswordChanged(user);
        return new AuthResponse(jwtService.generateToken(user), user.getEmail(), user.getFullName());
    }

    @Transactional
    public void incrementTokenVersion(UUID userId) {
        if (appUserRepository.incrementTokenVersion(userId) == 0) {
            throw new NoSuchElementException("User not found");
        }
    }

    private AuthResponse signIn(AppUser user) {
        String token = jwtService.generateToken(user);
        user.setLastLoginAt(LocalDateTime.now());
        appUserRepository.save(user);
        return new AuthResponse(token, user.getEmail(), user.getFullName());
    }

    /** A password BCrypt cannot take (over 72 bytes) is simply wrong, after the same amount of work. */
    boolean passwordMatches(String raw, String hash) {
        if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            passwordEncoder.matches("", hash);
            return false;
        }
        return passwordEncoder.matches(raw, hash);
    }

    /** At most one per address per hour, so sign-up attempts can't be used to flood someone's inbox. */
    private void sendAlreadyRegisteredNotice(AppUser user) {
        if (!rateLimiter.tryAcquire("register-notice:" + user.getId(), 1, NOTICE_COOLDOWN)) return;
        String base = frontendUrl.endsWith("/") ? frontendUrl.substring(0, frontendUrl.length() - 1) : frontendUrl;
        String login = base + "/login";
        String reset = base + "/forgot-password";
        String subject = "You already have a RoomTrack account";
        String text = "Someone, hopefully you, just tried to create a RoomTrack account with this email address. "
                + "You already have an account, so nothing was created and nothing about your account changed.\n\n"
                + "Sign in: " + login + "\n"
                + "Forgot your password? Reset it here: " + reset + "\n\n"
                + "If this wasn't you, you can ignore this email.\n";
        String html = "<p>Someone, hopefully you, just tried to create a RoomTrack account with this email address. "
                + "You already have an account, so nothing was created and nothing about your account changed.</p>"
                + "<p><a href=\"" + HtmlUtils.htmlEscape(login) + "\">Sign in</a></p>"
                + "<p>Forgot your password? <a href=\"" + HtmlUtils.htmlEscape(reset) + "\">Reset it here</a>.</p>"
                + "<p style=\"color:#666;font-size:13px\">If this wasn't you, you can ignore this email.</p>";
        emailService.send(user.getOwner().getId(), ALREADY_REGISTERED_EMAIL_TYPE,
                new EmailMessage(user.getEmail(), subject, html, text));
    }
}
