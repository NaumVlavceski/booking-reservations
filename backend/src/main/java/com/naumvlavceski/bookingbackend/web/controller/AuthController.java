package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.openapi.MessageSchema;
import com.naumvlavceski.bookingbackend.demo.DemoAccounts;
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
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = OpenApiConfig.TAG_AUTH)
public class AuthController {

    private final AuthService authService;
    private final EmailVerificationService verificationService;
    private final PasswordResetService passwordResetService;
    private final RateLimits rateLimits;
    private final DemoAccounts demoAccounts;

    /**
     * Audit API-03 (owner's decision: sign out everywhere). Bumps the user's token version, so every token issued so
     * far (this device and any other) stops working. Needs a valid token (SecurityConfig).
     */
    @Operation(summary = "Sign out on every device", description = "Ends all sessions of the signed-in user.")
    @ApiResponse(responseCode = "204", description = "Signed out")
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @org.springframework.security.core.annotation.AuthenticationPrincipal
            com.naumvlavceski.bookingbackend.config.security.CurrentUser currentUser) {
        authService.incrementTokenVersion(currentUser.userId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Create an account",
            description = "Creates the owner and emails a 6-digit code; the account can sign in once the code is "
                    + "verified (POST /api/auth/verify-email). The answer is the same 202 for an address that already "
                    + "has an account (that address gets an email instead), so it never reveals who is registered.")
    @ApiResponse(responseCode = "202", description = "Accepted; a code was emailed if the address is new or unverified")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/register")
    public ResponseEntity<RegistrationResponse> register(@Valid @RequestBody RegisterRequest request,
                                                         HttpServletRequest http) {
        String ip = limitByIp("register", http);
        rateLimits.enforce("register-ip:" + ip, limits().registerPerIp());
        rateLimits.enforce("register-email:" + RateLimits.email(request.email()), limits().registerPerEmail());
        // 202 for a new address and for one that already has an account (that owner gets an email instead)
        return ResponseEntity.accepted().body(authService.register(request));
    }

    @Operation(summary = "Sign in",
            description = "Returns a JWT for the `Authorization: Bearer` header. After 5 wrong passwords for one "
                    + "address, or 20 from one IP, within 15 minutes, every try is refused with 429 until the window "
                    + "moves on (temporary, never a permanent lock). Unknown addresses and wrong passwords get the "
                    + "same 401.")
    @ApiResponse(responseCode = "200", description = "Signed in")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "401", description = "Wrong email or password (no `code` in the body)",
            content = @Content(schema = @Schema(ref = "#/components/schemas/ApiError")))
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        String ip = limitByIp("login", http);
        return authService.login(request, ip);
    }

    @Operation(summary = "Try the demo",
            description = "Creates a private demo account with fictional sample data (2 properties, 5 rooms, 22 "
                    + "bookings) and signs you in; no body and no sign-up needed. Only you see it, and it is deleted "
                    + "with everything in it after 1 hour. Changing the password, deleting the account, emails and "
                    + "calendar links are turned off in it (403 `DEMO_RESTRICTED`). 404 when the demo is switched off; "
                    + "403 `DEMO_RESTRICTED` when too many demos exist right now; 10 per hour per IP.")
    @ApiResponse(responseCode = "200", description = "Demo created and signed in")
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/demo")
    public AuthResponse startDemo(HttpServletRequest http) {
        String ip = limitByIp("demo", http);
        rateLimits.enforce("demo-ip:" + ip, limits().demoPerIp());
        return demoAccounts.start();
    }

    @Operation(summary = "Verify the email address",
            description = "Checks the 6-digit code from the sign-up email and signs the user in. A code works once, "
                    + "for 15 minutes, with at most 5 wrong tries.")
    @ApiResponse(responseCode = "200", description = "Verified and signed in")
    @ApiResponse(responseCode = "400", description = "Wrong or expired code (`INVALID_CODE`), or invalid input",
            ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/verify-email")
    public AuthResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request, HttpServletRequest http) {
        limitByIp("verify", http);
        return authService.verifyEmail(request);
    }

    @Operation(summary = "Send a new verification code",
            description = "Same answer whether or not the address exists, is already verified, or is cooling down "
                    + "(one code per minute).")
    @ApiResponse(responseCode = "200", description = "Accepted",
            content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
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

    @Operation(summary = "Forgot password: email a reset code",
            description = "Step 1 of 3. Emails a code valid for 10 minutes. Same answer whether or not the address "
                    + "has an account.")
    @ApiResponse(responseCode = "200", description = "Accepted",
            content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request,
                                                              HttpServletRequest http) {
        String ip = limitByIp("forgot", http);
        rateLimits.enforce("forgot-ip:" + ip, limits().forgotPerIp());
        passwordResetService.requestReset(request.email());
        // Same answer whether or not the address exists, is verified, or is cooling down
        return ResponseEntity.ok(Map.of("message", "If an account with this email exists, we sent a code."));
    }

    @Operation(summary = "Forgot password: check the code",
            description = "Step 2 of 3. Exchanges the emailed code for a one-time reset token valid for 10 minutes.")
    @ApiResponse(responseCode = "200", description = "Code accepted")
    @ApiResponse(responseCode = "400", description = "Wrong or expired code (`INVALID_CODE`), or invalid input",
            ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/verify-reset-code")
    public ResetTokenResponse verifyResetCode(@Valid @RequestBody VerifyResetCodeRequest request,
                                              HttpServletRequest http) {
        limitByIp("verify-reset", http);
        return new ResetTokenResponse(passwordResetService.verifyCode(request.email(), request.code()));
    }

    @Operation(summary = "Forgot password: set the new password",
            description = "Step 3 of 3. Sets the new password with the reset token and ends every existing session.")
    @ApiResponse(responseCode = "200", description = "Password changed",
            content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @ApiResponse(responseCode = "400", description = "Invalid or used token (`RESET_TOKEN_INVALID`), or invalid input",
            ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
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
