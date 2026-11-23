package com.naumvlavceski.bookingbackend.admin;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * "Needs help": the one place where the rules live. {@link #flaggedOwnersCte} builds a SQL CTE {@code flagged} with
 * one row per listed owner (admins and demo accounts are never listed), their counts, and one boolean column per
 * reason. Thresholds come from {@code app.admin.attention}; "now" is passed in, so tests can fix the clock.
 *
 * <ul>
 *   <li>UNVERIFIED_24H: email not verified and the account is older than 24 h.</li>
 *   <li>SYNC_FAILING: a calendar with consecutive_failures ≥ 2, or no successful sync for 48 h while it exists
 *       (counted from when it was connected if it never succeeded).</li>
 *   <li>OPEN_CONFLICTS: at least one OPEN sync_conflict (what the owner's Conflicts page shows).</li>
 *   <li>STUCK_ONBOARDING: older than 3 days and (no units, or no reservations and no calendar).</li>
 *   <li>EMAIL_BOUNCED: a FAILED, BOUNCED or COMPLAINED email in the last 30 days.</li>
 *   <li>INACTIVE_14D: last seen more than 14 days ago (or never, and older than 14 days). Not part of "Needs help";
 *       it has its own filter.</li>
 * </ul>
 *
 * Columns without a time zone (app_user.created_at, external_calendar.created_at) were written in the JVM's zone, so
 * their thresholds are passed as local date-times in that zone; timestamptz columns get instants.
 */
public final class AttentionRules {
    public static final String UNVERIFIED_24H = "UNVERIFIED_24H";
    public static final String SYNC_FAILING = "SYNC_FAILING";
    public static final String OPEN_CONFLICTS = "OPEN_CONFLICTS";
    public static final String STUCK_ONBOARDING = "STUCK_ONBOARDING";
    public static final String EMAIL_BOUNCED = "EMAIL_BOUNCED";
    public static final String INACTIVE_14D = "INACTIVE_14D";

    /** The reasons that make up "Needs help" (most urgent first). */
    public static final List<String> NEEDS_HELP = List.of(SYNC_FAILING, OPEN_CONFLICTS, EMAIL_BOUNCED,
            UNVERIFIED_24H, STUCK_ONBOARDING);

    /** SQL: any "Needs help" reason. */
    public static final String NEEDS_HELP_SQL = "(r_sync OR r_conflicts OR r_email OR r_unverified OR r_stuck)";
    /** SQL: most urgent first (more and heavier reasons first). */
    public static final String URGENCY_SQL = "((CASE WHEN r_sync THEN 16 ELSE 0 END) + (CASE WHEN r_conflicts THEN 8 ELSE 0 END)"
            + " + (CASE WHEN r_email THEN 4 ELSE 0 END) + (CASE WHEN r_unverified THEN 2 ELSE 0 END)"
            + " + (CASE WHEN r_stuck THEN 1 ELSE 0 END))";

    private AttentionRules() {}

    /**
     * {@code WITH base AS (...), ..., flagged AS (...)}. {@code extraBaseWhere} (may be empty) narrows the base set,
     * for example a search; it can use the aliases {@code u} (app_user) and {@code o} (owner).
     */
    public static String flaggedOwnersCte(String extraBaseWhere) {
        return "WITH base AS ("
                + " SELECT u.id, u.owner_id, u.full_name, u.email, o.contact_phone, u.created_at, u.last_seen_at,"
                + " u.email_verified_at, u.last_login_at"
                + " FROM app_user u JOIN owner o ON o.id = u.owner_id"
                + " WHERE u.is_admin = FALSE AND o.demo = FALSE " + (extraBaseWhere == null ? "" : extraBaseWhere)
                + "), props AS (SELECT owner_id, count(*) AS n FROM property WHERE owner_id IN (SELECT owner_id FROM base) GROUP BY owner_id)"
                + ", rooms AS (SELECT owner_id, count(*) AS n FROM unit WHERE owner_id IN (SELECT owner_id FROM base) GROUP BY owner_id)"
                + ", res AS (SELECT owner_id, count(*) AS n FROM reservation WHERE owner_id IN (SELECT owner_id FROM base) GROUP BY owner_id)"
                + ", cals AS (SELECT x.owner_id, count(*) AS n,"
                + "   bool_or(c.consecutive_failures >= :syncFailures"
                + "     OR (c.last_success_at IS NOT NULL AND c.last_success_at < :syncStale)"
                + "     OR (c.last_success_at IS NULL AND c.created_at < :syncStaleLocal)) AS failing"
                + "   FROM external_calendar c JOIN unit x ON x.id = c.unit_id"
                + "   WHERE x.owner_id IN (SELECT owner_id FROM base) GROUP BY x.owner_id)"
                + ", conf AS (SELECT owner_id, count(*) AS n FROM sync_conflict WHERE status = 'OPEN'"
                + "   AND owner_id IN (SELECT owner_id FROM base) GROUP BY owner_id)"
                + ", mail AS (SELECT owner_id, count(*) AS n FROM email_log WHERE status IN ('FAILED', 'BOUNCED', 'COMPLAINED')"
                + "   AND created_at >= :emailSince AND owner_id IN (SELECT owner_id FROM base) GROUP BY owner_id)"
                + ", facts AS (SELECT b.*, coalesce(p.n, 0) AS properties, coalesce(rm.n, 0) AS units,"
                + "   coalesce(r.n, 0) AS reservations, coalesce(c.n, 0) AS calendars, coalesce(c.failing, FALSE) AS sync_failing,"
                + "   coalesce(cf.n, 0) AS open_conflicts, coalesce(m.n, 0) AS email_problems"
                + "   FROM base b LEFT JOIN props p ON p.owner_id = b.owner_id LEFT JOIN rooms rm ON rm.owner_id = b.owner_id"
                + "   LEFT JOIN res r ON r.owner_id = b.owner_id LEFT JOIN cals c ON c.owner_id = b.owner_id"
                + "   LEFT JOIN conf cf ON cf.owner_id = b.owner_id LEFT JOIN mail m ON m.owner_id = b.owner_id)"
                + ", flagged AS (SELECT f.*,"
                + "   (f.email_verified_at IS NULL AND f.created_at < :unverifiedBeforeLocal) AS r_unverified,"
                + "   f.sync_failing AS r_sync,"
                + "   (f.open_conflicts > 0) AS r_conflicts,"
                + "   (f.created_at < :stuckBeforeLocal AND (f.units = 0 OR (f.reservations = 0 AND f.calendars = 0))) AS r_stuck,"
                + "   (f.email_problems > 0) AS r_email,"
                + "   (CASE WHEN f.last_seen_at IS NULL THEN f.created_at < :inactiveBeforeLocal"
                + "         ELSE f.last_seen_at < :inactiveBefore END) AS r_inactive"
                + "   FROM facts f) ";
    }

    /** The thresholds for {@link #flaggedOwnersCte}, relative to {@code now}. */
    public static MapSqlParameterSource params(AdminProperties.Attention a, Instant now) {
        return new MapSqlParameterSource()
                .addValue("syncFailures", a.syncFailures())
                .addValue("syncStale", Times.utc(now.minus(Duration.ofHours(a.syncStaleHours()))))
                .addValue("syncStaleLocal", Times.local(now.minus(Duration.ofHours(a.syncStaleHours()))))
                .addValue("emailSince", Times.utc(now.minus(Duration.ofDays(a.emailProblemDays()))))
                .addValue("unverifiedBeforeLocal", Times.local(now.minus(Duration.ofHours(a.unverifiedHours()))))
                .addValue("stuckBeforeLocal", Times.local(now.minus(Duration.ofDays(a.stuckDays()))))
                .addValue("inactiveBefore", Times.utc(now.minus(Duration.ofDays(a.inactiveDays()))))
                .addValue("inactiveBeforeLocal", Times.local(now.minus(Duration.ofDays(a.inactiveDays()))));
    }

    /** The reason codes of the current {@code flagged} row, most urgent first, INACTIVE_14D last. */
    public static List<String> reasons(ResultSet rs) throws SQLException {
        List<String> out = new ArrayList<>(6);
        if (rs.getBoolean("r_sync")) out.add(SYNC_FAILING);
        if (rs.getBoolean("r_conflicts")) out.add(OPEN_CONFLICTS);
        if (rs.getBoolean("r_email")) out.add(EMAIL_BOUNCED);
        if (rs.getBoolean("r_unverified")) out.add(UNVERIFIED_24H);
        if (rs.getBoolean("r_stuck")) out.add(STUCK_ONBOARDING);
        if (rs.getBoolean("r_inactive")) out.add(INACTIVE_14D);
        return out;
    }

    /** Time helpers for the two kinds of timestamp columns. */
    public static final class Times {
        private Times() {}

        public static java.time.OffsetDateTime utc(Instant i) {
            return i == null ? null : java.time.OffsetDateTime.ofInstant(i, java.time.ZoneOffset.UTC);
        }

        /** For columns without a time zone, which hold JVM-local time. */
        public static LocalDateTime local(Instant i) {
            return i == null ? null : LocalDateTime.ofInstant(i, ZoneId.systemDefault());
        }

        public static Instant instant(java.sql.Timestamp t) {
            return t == null ? null : t.toInstant();
        }
    }
}
