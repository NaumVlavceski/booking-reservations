package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Send email from the admin panel. The sender and Reply-To come only from the server's configuration
 * (APP_ADMIN_MAIL_FROM, APP_ADMIN_MAIL_REPLY_TO); an empty sender switches the feature off. One recipient, a one-line
 * subject (1–150) and a plain-text message (1–5000), no CR/LF in the subject or the address (header injection). The
 * message is sent HTML-escaped with line breaks in a minimal template: no tracking, no attachments, no added links.
 * Logged in email_log as ADMIN_MESSAGE with the body (the only type that stores one) and linked to the owner whose
 * account email matches the recipient; audited with ids only. At most 20 per hour per admin session.
 */
@Service
public class AdminEmailService {
    public static final int MAX_SUBJECT = 150;
    public static final int MAX_MESSAGE = 5000;
    public static final int MAX_ADDRESS = 254;
    public static final String EMAIL_SENT = "EMAIL_SENT";
    public static final String EMAIL_SEND_FAILED = "EMAIL_SEND_FAILED";
    /** One plain address; no display name, no list, no whitespace or control characters. */
    private static final Pattern ADDRESS = Pattern.compile(
            "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$");

    private final EmailService emailService;
    private final JdbcTemplate jdbc;
    private final AdminAuditService audit;
    private final RateLimits rateLimits;
    private final String from;
    private final String replyTo;

    public AdminEmailService(EmailService emailService, JdbcTemplate jdbc, AdminAuditService audit, RateLimits rateLimits,
                             @Value("${app.admin.mail-from:}") String from,
                             @Value("${app.admin.mail-reply-to:}") String replyTo) {
        this.emailService = emailService;
        this.jdbc = jdbc;
        this.audit = audit;
        this.rateLimits = rateLimits;
        this.from = from == null ? "" : from.trim();
        this.replyTo = replyTo == null ? "" : replyTo.trim();
        if (hasLineBreak(this.from) || hasLineBreak(this.replyTo)) {
            throw new IllegalStateException("APP_ADMIN_MAIL_FROM / APP_ADMIN_MAIL_REPLY_TO must be one line");
        }
        if (!this.replyTo.isEmpty() && !ADDRESS.matcher(this.replyTo).matches()) {
            throw new IllegalStateException("APP_ADMIN_MAIL_REPLY_TO must be one plain email address");
        }
    }

    public boolean enabled() {
        return !from.isEmpty();
    }

    /** Shown read-only in the form. */
    public String from() {
        return from;
    }

    public record Result(boolean sent, UUID emailLogId, UUID ownerUserId) {}

    /** Throws IllegalArgumentException (400) for invalid input; check {@link #enabled()} first. */
    public Result send(UUID adminUserId, UUID sessionId, String rawTo, String rawSubject, String rawMessage,
                       HttpServletRequest request) {
        if (!enabled()) throw new IllegalStateException("Send email is not configured");
        String to = rawTo == null ? "" : rawTo.trim();
        String subject = rawSubject == null ? "" : rawSubject.strip();
        String message = rawMessage == null ? "" : rawMessage.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (hasLineBreak(rawTo == null ? "" : rawTo) || to.length() > MAX_ADDRESS || !ADDRESS.matcher(to).matches()) {
            throw new IllegalArgumentException("Enter one valid email address.");
        }
        if (hasLineBreak(rawSubject == null ? "" : rawSubject)) {
            throw new IllegalArgumentException("The subject must be one line.");
        }
        if (subject.isEmpty() || subject.length() > MAX_SUBJECT) {
            throw new IllegalArgumentException("The subject must be 1 to " + MAX_SUBJECT + " characters.");
        }
        if (message.isEmpty() || message.length() > MAX_MESSAGE) {
            throw new IllegalArgumentException("The message must be 1 to " + MAX_MESSAGE + " characters.");
        }
        rateLimits.enforce("admin-mail:" + sessionId, rateLimits.limits().adminMailPerSession());

        // The owner whose account email is the recipient, if any: the email shows in their history
        List<Map<String, Object>> owner = jdbc.queryForList(
                "SELECT id, owner_id FROM app_user WHERE lower(email) = lower(?) LIMIT 1", to);
        UUID ownerUserId = owner.isEmpty() ? null : (UUID) owner.getFirst().get("id");
        UUID ownerId = owner.isEmpty() ? null : (UUID) owner.getFirst().get("owner_id");

        EmailMessage mail = new EmailMessage(to, subject, html(message), message + "\n", Map.of(),
                replyTo.isEmpty() ? null : replyTo, from);
        EmailService.AdminSend result = emailService.sendAdminMessage(ownerId, adminUserId, mail, message);

        Map<String, Object> details = new LinkedHashMap<>();
        if (result.logId() != null) details.put("emailLog", result.logId());
        audit.record(adminUserId, result.sent() ? EMAIL_SENT : EMAIL_SEND_FAILED, ownerUserId, details, request);
        return new Result(result.sent(), result.logId(), ownerUserId);
    }

    /** Escaped text with line breaks; nothing else. */
    static String html(String message) {
        return "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111\">"
                + HtmlUtils.htmlEscape(message).replace("\n", "<br>") + "</div>";
    }

    private static boolean hasLineBreak(String s) {
        return s.indexOf('\r') >= 0 || s.indexOf('\n') >= 0;
    }
}
