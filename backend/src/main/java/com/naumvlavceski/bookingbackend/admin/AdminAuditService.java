package com.naumvlavceski.bookingbackend.admin;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Writes admin_audit_log. {@code details} may only hold ids, counts and short enum-like values: never emails, names,
 * secrets, codes, tokens, message bodies or search terms. Keys are checked against a deny list as a safety net.
 * Append-only: nothing here updates or deletes.
 */
@Slf4j
@Service
public class AdminAuditService {
    public static final String STEPUP_REQUESTED = "STEPUP_CODE_REQUESTED";
    public static final String STEPUP_FAILED = "STEPUP_FAILED";
    public static final String STEPUP_LOCKED = "STEPUP_LOCKED";
    public static final String SESSION_STARTED = "SESSION_STARTED";
    public static final String SESSION_EXTENDED = "SESSION_EXTENDED";
    public static final String SESSION_ENDED = "SESSION_ENDED";
    public static final String OVERVIEW_VIEWED = "OVERVIEW_VIEWED";
    public static final String OWNERS_LISTED = "OWNERS_LISTED";
    public static final String OWNER_VIEWED = "OWNER_VIEWED";
    public static final String RESERVATIONS_VIEWED = "RESERVATIONS_VIEWED";
    public static final String CALENDARS_VIEWED = "CALENDARS_VIEWED";
    public static final String EMAILS_VIEWED = "EMAILS_VIEWED";
    public static final String EMAIL_BODY_VIEWED = "EMAIL_BODY_VIEWED";
    public static final String NOTES_VIEWED = "NOTES_VIEWED";
    public static final String NOTE_CREATED = "NOTE_CREATED";
    public static final String NOTE_UPDATED = "NOTE_UPDATED";
    public static final String NOTE_DELETED = "NOTE_DELETED";
    public static final String FOLLOW_UPS_VIEWED = "FOLLOW_UPS_VIEWED";
    public static final String AUDIT_LOG_VIEWED = "AUDIT_LOG_VIEWED";
    public static final String SYSTEM_VIEWED = "SYSTEM_VIEWED";

    private static final Set<String> FORBIDDEN_KEYS = Set.of("email", "to", "recipient", "name", "fullname", "phone",
            "query", "search", "term", "body", "message", "text", "subject", "code", "token", "password", "secret", "url");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public AdminAuditService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public void record(UUID adminUserId, String action, UUID targetUserId, Map<String, ?> details,
                       HttpServletRequest request) {
        if (details != null) {
            for (String key : details.keySet()) {
                if (FORBIDDEN_KEYS.contains(key.toLowerCase())) {
                    throw new IllegalArgumentException("Audit details may not contain '" + key + "'");
                }
            }
        }
        String ip = request == null ? null : truncate(request.getRemoteAddr(), 64);
        String agent = request == null ? null : truncate(request.getHeader("User-Agent"), 200);
        jdbc.update("INSERT INTO admin_audit_log (admin_user_id, action, target_user_id, details, ip, user_agent, created_at) "
                        + "VALUES (?, ?, ?, ?::jsonb, ?, ?, ?)",
                adminUserId, action, targetUserId, details == null || details.isEmpty() ? null : JSON.writeValueAsString(details),
                ip, agent, OffsetDateTime.now(clock));
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
