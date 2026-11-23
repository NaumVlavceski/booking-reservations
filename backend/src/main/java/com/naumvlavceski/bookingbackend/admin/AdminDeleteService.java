package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import com.naumvlavceski.bookingbackend.service.OwnerDeletionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Delete owner from the admin panel. Uses the same deletion routine as the owner's own "Delete my account"
 * ({@link OwnerDeletionService}); this class only adds the admin's checks, the counts and the audit record.
 * In one transaction: a failure anywhere leaves everything as it was. No email is sent to the owner.
 */
@Service
public class AdminDeleteService {
    public static final String OWNER_DELETED = "OWNER_DELETED";
    public static final String SUMMARY_VIEWED = "DELETION_SUMMARY_VIEWED";

    private final JdbcTemplate jdbc;
    private final OwnerDeletionService deletion;
    private final AdminAuditService audit;
    private final RateLimits rateLimits;

    public AdminDeleteService(JdbcTemplate jdbc, OwnerDeletionService deletion, AdminAuditService audit, RateLimits rateLimits) {
        this.jdbc = jdbc;
        this.deletion = deletion;
        this.audit = audit;
        this.rateLimits = rateLimits;
    }

    /** What would go (and, after a delete, what went). Sign-ins and sessions: all of them. */
    public record Summary(long properties, long units, long reservations, long calendarConnections,
                          long emailsInHistory, long notes, long codes) {
        Map<String, Object> asAuditDetails() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("properties", properties);
            m.put("units", units);
            m.put("reservations", reservations);
            m.put("calendarConnections", calendarConnections);
            m.put("emailsInHistory", emailsInHistory);
            m.put("notes", notes);
            return m;
        }
    }

    private record Target(UUID userId, UUID ownerId, String email, boolean anyAdmin, boolean demo) {}

    private Target target(UUID userId) {
        List<Target> found = jdbc.query("SELECT u.id, u.owner_id, u.email, o.demo, "
                        + "EXISTS (SELECT 1 FROM app_user a WHERE a.owner_id = u.owner_id AND a.is_admin) AS any_admin "
                        + "FROM app_user u JOIN owner o ON o.id = u.owner_id WHERE u.id = ?",
                (rs, i) -> new Target(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class),
                        rs.getString("email"), rs.getBoolean("any_admin"), rs.getBoolean("demo")), userId);
        // Demo accounts are not listed in Admin (they delete themselves after an hour)
        if (found.isEmpty() || found.getFirst().demo()) throw new NoSuchElementException("Owner not found");
        return found.getFirst();
    }

    private Summary count(Target t) {
        UUID o = t.ownerId();
        return new Summary(
                n("SELECT count(*) FROM property WHERE owner_id = ?", o),
                n("SELECT count(*) FROM unit WHERE owner_id = ?", o),
                n("SELECT count(*) FROM reservation WHERE owner_id = ?", o),
                n("SELECT count(*) FROM external_calendar c JOIN unit x ON x.id = c.unit_id WHERE x.owner_id = ?", o),
                n("SELECT count(*) FROM email_log WHERE owner_id = ? OR lower(to_address) IN "
                        + "(SELECT lower(email) FROM app_user WHERE owner_id = ?)", o, o),
                n("SELECT count(*) FROM admin_note WHERE owner_user_id IN (SELECT id FROM app_user WHERE owner_id = ?)", o),
                n("SELECT (SELECT count(*) FROM email_verification v JOIN app_user u ON u.id = v.user_id WHERE u.owner_id = ?) "
                        + "+ (SELECT count(*) FROM password_reset r JOIN app_user u ON u.id = r.user_id WHERE u.owner_id = ?)", o, o));
    }

    private long n(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0 : v;
    }

    /** Not read-only: it also writes the audit row. */
    @Transactional
    public Summary summary(UUID adminUserId, UUID targetUserId, HttpServletRequest request) {
        Target t = target(targetUserId);
        Summary s = count(t);
        audit.record(adminUserId, SUMMARY_VIEWED, targetUserId, null, request);
        return s;
    }

    /**
     * Deletes the owner behind {@code targetUserId}. 404 for unknown or demo accounts; 400 for the admin's own
     * account, any admin account, or a typed email that doesn't match (case-insensitive).
     */
    @Transactional
    public Summary delete(UUID adminUserId, UUID targetUserId, String confirmEmail, HttpServletRequest request) {
        rateLimits.enforce("admin-delete:" + adminUserId, rateLimits.limits().adminDeletePerAdmin());
        Target t = target(targetUserId);
        if (t.userId().equals(adminUserId)) {
            throw new IllegalArgumentException("You can't delete your own account here.");
        }
        if (t.anyAdmin()) {
            throw new IllegalArgumentException("Admin accounts can't be deleted here. Remove the admin flag in the database first.");
        }
        String typed = confirmEmail == null ? "" : confirmEmail.trim().toLowerCase(Locale.ROOT);
        if (!typed.equals(t.email().toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("The typed email doesn't match the owner's email.");
        }
        Summary s = count(t);
        deletion.deleteOwnerData(t.ownerId());
        // Ids and counts only: never the email or the name
        audit.record(adminUserId, OWNER_DELETED, targetUserId, s.asAuditDetails(), request);
        return s;
    }
}
