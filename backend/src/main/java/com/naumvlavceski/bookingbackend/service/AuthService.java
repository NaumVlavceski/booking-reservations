package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.AuthResponse;
import com.naumvlavceski.bookingbackend.dto.LoginRequest;
import com.naumvlavceski.bookingbackend.dto.MeResponse;
import com.naumvlavceski.bookingbackend.dto.RegisterRequest;
import com.naumvlavceski.bookingbackend.dto.RegistrationResponse;
import com.naumvlavceski.bookingbackend.dto.VerifyEmailRequest;
import com.naumvlavceski.bookingbackend.exception.EmailNotVerifiedException;
import com.naumvlavceski.bookingbackend.exception.TooManyRequestsException;
import com.naumvlavceski.bookingbackend.exception.VerificationException;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimiter;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.model.Role;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.config.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final OwnerRepository ownerRepository;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailVerificationService verificationService;
    private final PasswordResetService passwordResetService;
    private final RateLimiter rateLimiter;

    private static final int CHANGE_PASSWORD_TRIES = 5;
    private static final Duration CHANGE_PASSWORD_WINDOW = Duration.ofMinutes(15);

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found"));
        return new MeResponse(user.getEmail(), user.getFullName(), user.getOwner().getBusinessName());
    }

    @Transactional
    public RegistrationResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (appUserRepository.existsByEmailIgnoreCase(email)) {
            throw new IllegalArgumentException("Email already registered");
        }
        Owner owner = new Owner();
        owner.setBusinessName(request.businessName());
        owner.setContactPhone(request.contactPhone());
        owner.setActive(true);
        owner = ownerRepository.save(owner);

        AppUser user = new AppUser();
        user.setOwner(owner);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFullName(request.fullName());
        user.setRole(Role.OWNER);
        user = appUserRepository.save(user);

        // No token yet: the address must be verified with the emailed code first
        verificationService.issueAndSend(user);
        return new RegistrationResponse(user.getEmail(), true);
    }

    public AuthResponse verifyEmail(VerifyEmailRequest request) {
        AppUser user = verificationService.verify(request.email(), request.code());
        return signIn(user);
    }

    public AuthResponse login(LoginRequest request) {
        AppUser user = appUserRepository.findFirstByEmailIgnoreCase(request.email().trim())
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid email or password");
        }

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
        if (!rateLimiter.tryAcquire("change-password:" + userId, CHANGE_PASSWORD_TRIES, CHANGE_PASSWORD_WINDOW)) {
            throw new TooManyRequestsException();
        }
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found"));
        // 400, never 401: the frontend signs people out on a 401
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
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
}