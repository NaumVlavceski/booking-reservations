package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.dto.AuthResponse;
import com.naumvlavceski.bookingbackend.dto.LoginRequest;
import com.naumvlavceski.bookingbackend.dto.RegisterRequest;
import com.naumvlavceski.bookingbackend.dto.RegistrationResponse;
import com.naumvlavceski.bookingbackend.dto.ResendCodeRequest;
import com.naumvlavceski.bookingbackend.dto.VerifyEmailRequest;
import com.naumvlavceski.bookingbackend.exception.TooManyRequestsException;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimiter;
import com.naumvlavceski.bookingbackend.service.AuthService;
import com.naumvlavceski.bookingbackend.service.EmailVerificationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final Duration IP_WINDOW = Duration.ofHours(1);

    private final AuthService authService;
    private final EmailVerificationService verificationService;
    private final RateLimiter rateLimiter;

    @Value("${app.auth.ip-limit-per-hour:30}")
    private int ipLimitPerHour;

    @PostMapping("/register")
    public ResponseEntity<RegistrationResponse> register(@Valid @RequestBody RegisterRequest request,
                                                         HttpServletRequest http) {
        limitByIp("register", http);
        return ResponseEntity.accepted().body(authService.register(request));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/verify-email")
    public AuthResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request, HttpServletRequest http) {
        limitByIp("verify", http);
        return authService.verifyEmail(request);
    }

    @PostMapping("/resend-code")
    public ResponseEntity<Map<String, String>> resendCode(@Valid @RequestBody ResendCodeRequest request,
                                                           HttpServletRequest http) {
        limitByIp("resend", http);
        verificationService.resend(request.email());
        // Same answer whether or not the address exists, is verified, or is cooling down
        return ResponseEntity.ok(Map.of("message", "If this address needs verification, a new code has been sent."));
    }

    private void limitByIp(String action, HttpServletRequest http) {
        if (!rateLimiter.tryAcquire(action + ":" + clientIp(http), ipLimitPerHour, IP_WINDOW)) {
            throw new TooManyRequestsException();
        }
    }

    /** Caddy sets X-Forwarded-For to the real client; the backend is not reachable except through it. */
    private static String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return http.getRemoteAddr();
    }
}
