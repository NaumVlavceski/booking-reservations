package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.dto.AuthResponse;
import com.naumvlavceski.bookingbackend.dto.ForgotPasswordRequest;
import com.naumvlavceski.bookingbackend.dto.LoginRequest;
import com.naumvlavceski.bookingbackend.dto.RegisterRequest;
import com.naumvlavceski.bookingbackend.dto.RegistrationResponse;
import com.naumvlavceski.bookingbackend.dto.ResendCodeRequest;
import com.naumvlavceski.bookingbackend.dto.ResetPasswordRequest;
import com.naumvlavceski.bookingbackend.dto.ResetTokenResponse;
import com.naumvlavceski.bookingbackend.dto.VerifyEmailRequest;
import com.naumvlavceski.bookingbackend.dto.VerifyResetCodeRequest;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimitProperties;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import com.naumvlavceski.bookingbackend.service.AuthService;
import com.naumvlavceski.bookingbackend.service.EmailVerificationService;
import com.naumvlavceski.bookingbackend.service.PasswordResetService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Public sign-up and sign-in. Every endpoint has a per-IP limit (app.rate-limit.auth-per-ip, counted per action);
 * the ones that send email or check a password have tighter limits on top. All refusals are 429 with Retry-After,
 * and none of them depends on whether an account exists.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final EmailVerificationService verificationService;
    private final PasswordResetService passwordResetService;
    private final RateLimits rateLimits;

    @PostMapping("/register")
    public ResponseEntity<RegistrationResponse> register(@Valid @RequestBody RegisterRequest request,
                                                         HttpServletRequest http) {
        String ip = limitByIp("register", http);
        rateLimits.enforce("register-ip:" + ip, limits().registerPerIp());
        rateLimits.enforce("register-email:" + RateLimits.email(request.email()), limits().registerPerEmail());
        // 202 for a new address and for one that already has an account (that owner gets an email instead)
        return ResponseEntity.accepted().body(authService.register(request));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        String ip = limitByIp("login", http);
        return authService.login(request, ip);
    }

    @PostMapping("/verify-email")
    public AuthResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request, HttpServletRequest http) {
        limitByIp("verify", http);
        return authService.verifyEmail(request);
    }

    @PostMapping("/resend-code")
    public ResponseEntity<Map<String, String>> resendCode(@Valid @RequestBody ResendCodeRequest request,
                                                           HttpServletRequest http) {
        String ip = limitByIp("resend", http);
        rateLimits.enforce("resend-ip:" + ip, limits().resendPerIp());
        rateLimits.enforce("resend-email:" + RateLimits.email(request.email()), limits().resendPerEmail());
        verificationService.resend(request.email());
        // Same answer whether or not the address exists, is verified, or is cooling down
        return ResponseEntity.ok(Map.of("message", "If this address needs verification, a new code has been sent."));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request,
                                                              HttpServletRequest http) {
        String ip = limitByIp("forgot", http);
        rateLimits.enforce("forgot-ip:" + ip, limits().forgotPerIp());
        passwordResetService.requestReset(request.email());
        // Same answer whether or not the address exists, is verified, or is cooling down
        return ResponseEntity.ok(Map.of("message", "If an account with this email exists, we sent a code."));
    }

    @PostMapping("/verify-reset-code")
    public ResetTokenResponse verifyResetCode(@Valid @RequestBody VerifyResetCodeRequest request,
                                              HttpServletRequest http) {
        limitByIp("verify-reset", http);
        return new ResetTokenResponse(passwordResetService.verifyCode(request.email(), request.code()));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(@Valid @RequestBody ResetPasswordRequest request,
                                                             HttpServletRequest http) {
        limitByIp("reset", http);
        passwordResetService.resetPassword(request.resetToken(), request.newPassword());
        return ResponseEntity.ok(Map.of("message", "Your password has been changed. Please sign in."));
    }

    private RateLimitProperties limits() {
        return rateLimits.limits();
    }

    /** The general per-IP limit of one action; returns the client IP for the action's own limits. */
    private String limitByIp(String action, HttpServletRequest http) {
        String ip = RateLimits.clientIp(http);
        rateLimits.enforce(action + ":" + ip, limits().authPerIp());
        return ip;
    }
}
