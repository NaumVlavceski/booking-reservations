package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.admin.AdminAccessFilter.AdminContext;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Opening and closing the admin session. Reaching any of these already means: panel enabled, valid owner session,
 * is_admin (AdminAccessFilter). The code is never part of any answer.
 */
@Hidden
@RestController
@RequestMapping(AdminAccessFilter.PREFIX + "/auth")
public class AdminAuthController {
    private final AdminStepUpService stepUp;
    private final AdminSessionService sessions;
    private final AdminAuditService audit;

    public AdminAuthController(AdminStepUpService stepUp, AdminSessionService sessions, AdminAuditService audit) {
        this.stepUp = stepUp;
        this.sessions = sessions;
        this.audit = audit;
    }

    public record VerifyCodeRequest(@NotBlank @Size(max = 12) String code) {}

    public record SessionResponse(String sessionToken, Instant expiresAt, Instant maxExpiresAt) {}

    static AdminContext context(HttpServletRequest request) {
        return (AdminContext) request.getAttribute(AdminContext.ATTRIBUTE);
    }

    @PostMapping("/request-code")
    public ResponseEntity<Map<String, Object>> requestCode(HttpServletRequest request) {
        AdminContext ctx = context(request);
        stepUp.requestCode(ctx.userId(), request);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sentTo", mask(ctx.email()));
        body.put("expiresInSeconds", AdminStepUpService.TTL.toSeconds());
        body.put("resendAfterSeconds", AdminStepUpService.RESEND_COOLDOWN.toSeconds());
        // false only in development without mail ("local" profile): no code was sent, verify-code opens the session
        body.put("codeRequired", stepUp.codeRequired());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
    }

    @PostMapping("/verify-code")
    public SessionResponse verifyCode(@Valid @RequestBody VerifyCodeRequest body, HttpServletRequest request,
                                      HttpServletResponse response) {
        AdminSessionService.Opened opened = stepUp.verifyCode(context(request).userId(), body.code(), request);
        AdminAccessFilter.expiryHeaders(response, opened.session().expiresAt(), opened.session().maxExpiresAt());
        return new SessionResponse(opened.token(), opened.session().expiresAt(), opened.session().maxExpiresAt());
    }

    /** Polling for the countdown: not audited. */
    @GetMapping("/session")
    public SessionResponse session(HttpServletRequest request) {
        AdminSessionService.Session s = context(request).session();
        return new SessionResponse(null, s.expiresAt(), s.maxExpiresAt());
    }

    /** Continue: one more window, refused (409 ADMIN_SESSION_CAP) at the absolute cap. Ordinary use never extends. */
    @PostMapping("/extend")
    public ResponseEntity<?> extend(HttpServletRequest request, HttpServletResponse response) {
        AdminContext ctx = context(request);
        return sessions.extend(ctx.session())
                .<ResponseEntity<?>>map(s -> {
                    audit.record(ctx.userId(), AdminAuditService.SESSION_EXTENDED, null, Map.of("session", s.id()), request);
                    AdminAccessFilter.expiryHeaders(response, s.expiresAt(), s.maxExpiresAt());
                    return ResponseEntity.ok(new SessionResponse(null, s.expiresAt(), s.maxExpiresAt()));
                })
                .orElseGet(() -> {
                    Map<String, Object> err = new LinkedHashMap<>();
                    err.put("timestamp", Instant.now());
                    err.put("status", 409);
                    err.put("error", "Conflict");
                    err.put("message", "The admin session can't be extended any further. Confirm a new code to continue.");
                    err.put("code", "ADMIN_SESSION_CAP");
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(err);
                });
    }

    /** Log out of Admin: ends only the admin session; the owner session stays. */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        AdminContext ctx = context(request);
        if (ctx.session() != null) {
            sessions.revoke(ctx.session().id());
            audit.record(ctx.userId(), AdminAuditService.SESSION_ENDED, null, Map.of("session", ctx.session().id()), request);
        }
        return ResponseEntity.noContent().build();
    }

    /** "a•••••@gmail.com": enough to recognise the inbox. */
    static String mask(String email) {
        if (email == null) return "";
        int at = email.indexOf('@');
        if (at < 1) return "•••••";
        return email.charAt(0) + "•••••" + email.substring(at);
    }
}
