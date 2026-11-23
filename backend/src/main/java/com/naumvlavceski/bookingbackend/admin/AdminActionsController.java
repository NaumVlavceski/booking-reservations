package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.admin.AdminAccessFilter.AdminContext;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** The admin panel's two write actions besides notes: Send email and Delete owner (Batch C). */
@Hidden
@RestController
@RequestMapping(AdminAccessFilter.PREFIX)
public class AdminActionsController {
    private final AdminEmailService email;
    private final AdminDeleteService deletion;

    public AdminActionsController(AdminEmailService email, AdminDeleteService deletion) {
        this.email = email;
        this.deletion = deletion;
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message, String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("message", message);
        body.put("code", code);
        return ResponseEntity.status(status).body(body);
    }

    // ---------- Send email ----------

    /** Whether Send email is on, and the fixed sender shown read-only in the form. Not audited. */
    @GetMapping("/emails/config")
    public Map<String, Object> emailConfig() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("enabled", email.enabled());
        m.put("from", email.enabled() ? email.from() : null);
        return m;
    }

    /** The request has no "from": the sender is never taken from it. ownerId is only a hint from the UI. */
    public record SendEmailRequest(String to, String subject, String message, UUID ownerId) {}

    @PostMapping("/emails/send")
    public ResponseEntity<Map<String, Object>> send(@RequestBody SendEmailRequest body, HttpServletRequest request) {
        if (!email.enabled()) {
            return error(HttpStatus.CONFLICT, "Send email is turned off: APP_ADMIN_MAIL_FROM is not set on the server.",
                    "ADMIN_MAIL_DISABLED");
        }
        AdminContext ctx = AdminAuthController.context(request);
        AdminEmailService.Result r = email.send(ctx.userId(), ctx.session().id(), body.to(), body.subject(),
                body.message(), request);
        if (!r.sent()) {
            return error(HttpStatus.BAD_GATEWAY, "The email could not be sent. Nothing was lost: try again.", "ADMIN_MAIL_FAILED");
        }
        Map<String, Object> ok = new LinkedHashMap<>();
        ok.put("emailLogId", r.emailLogId());
        ok.put("ownerId", r.ownerUserId());
        return ResponseEntity.ok(ok);
    }

    // ---------- Delete owner ----------

    @GetMapping("/owners/{id}/deletion-summary")
    public AdminDeleteService.Summary deletionSummary(@PathVariable UUID id, HttpServletRequest request) {
        return deletion.summary(AdminAuthController.context(request).userId(), id, request);
    }

    public record DeleteOwnerRequest(String confirmEmail) {}

    @DeleteMapping("/owners/{id}")
    public AdminDeleteService.Summary deleteOwner(@PathVariable UUID id, @RequestBody(required = false) DeleteOwnerRequest body,
                                                  HttpServletRequest request) {
        return deletion.delete(AdminAuthController.context(request).userId(), id,
                body == null ? null : body.confirmEmail(), request);
    }
}
