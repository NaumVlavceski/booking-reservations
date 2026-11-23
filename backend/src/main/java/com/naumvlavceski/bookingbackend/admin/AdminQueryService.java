package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.admin.AdminDtos.*;
import com.naumvlavceski.bookingbackend.admin.AttentionRules.Times;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * The admin panel's read queries. Counts come from grouped queries (AttentionRules' CTE), lists are paged in SQL, and
 * every query excludes admin and demo accounts. Owners are addressed by their app_user id.
 */
@Service
@Transactional(readOnly = true)
public class AdminQueryService {
    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 50;
    public static final int MIN_SEARCH = 2;
    public static final int MAX_SEARCH = 100;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    private final AdminProperties props;
    private final SystemStatusService system;

    public AdminQueryService(NamedParameterJdbcTemplate jdbc, Clock clock, AdminProperties props, SystemStatusService system) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.props = props;
        this.system = system;
    }

    // ---------- paging and search input ----------

    public static void checkPaging(int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw new IllegalArgumentException("size must be between 1 and " + MAX_SIZE);
    }

    /** Trimmed term, or null when shorter than 2 characters (then the normal list is shown). Over 100: 400. */
    public static String normalizeTerm(String raw) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.length() > MAX_SEARCH) throw new IllegalArgumentException("Search must be at most " + MAX_SEARCH + " characters");
        return t.length() < MIN_SEARCH ? null : t;
    }

    /** LIKE pattern for a contains match; %, _ and \ in the term match themselves. */
    public static String containsPattern(String term) {
        return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    /** The term with spaces, dashes, brackets and '+' removed, if what is left is at least 2 digits. */
    public static String phoneDigits(String term) {
        String d = term.replaceAll("[\\s\\-()+]", "");
        return d.length() >= MIN_SEARCH && d.chars().allMatch(Character::isDigit) ? d : null;
    }

    // ---------- owners ----------

    public enum Filter { ATTENTION, ALL, INACTIVE14 }

    public enum Sort { URGENCY, LAST_SEEN, REGISTERED }

    public OwnerPage owners(String rawQuery, Filter filter, Sort sort, int page, int size) {
        checkPaging(page, size);
        String term = normalizeTerm(rawQuery);
        Instant now = clock.instant();
        MapSqlParameterSource p = AttentionRules.params(props.attention(), now);
        StringBuilder search = new StringBuilder();
        if (term != null) {
            p.addValue("like", containsPattern(term));
            search.append("AND (u.full_name ILIKE :like ESCAPE '\\' OR u.email ILIKE :like ESCAPE '\\'");
            String digits = phoneDigits(term);
            if (digits != null) {
                p.addValue("digits", containsPattern(digits));
                search.append(" OR regexp_replace(coalesce(o.contact_phone, ''), '[[:space:]()+-]', '', 'g') LIKE :digits ESCAPE '\\'");
            }
            search.append(")");
        }
        String cte = AttentionRules.flaggedOwnersCte(search.toString());
        String where = switch (filter) {
            case ATTENTION -> "WHERE " + AttentionRules.NEEDS_HELP_SQL;
            case INACTIVE14 -> "WHERE r_inactive";
            case ALL -> "";
        };
        Sort effective = sort == null ? (filter == Filter.ATTENTION ? Sort.URGENCY : Sort.REGISTERED) : sort;
        String order = switch (effective) {
            case URGENCY -> AttentionRules.URGENCY_SQL + " DESC, last_seen_at DESC NULLS LAST, id";
            case LAST_SEEN -> "last_seen_at DESC NULLS LAST, id";
            case REGISTERED -> "created_at DESC NULLS LAST, id";
        };
        p.addValue("limit", size).addValue("offset", (long) page * size);

        List<OwnerRow> rows = jdbc.query(cte + "SELECT * FROM flagged " + where + " ORDER BY " + order
                + " LIMIT :limit OFFSET :offset", p, OWNER_ROW);
        FilterCounts counts = jdbc.queryForObject(cte + "SELECT count(*) FILTER (WHERE " + AttentionRules.NEEDS_HELP_SQL
                + ") AS a, count(*) AS t, count(*) FILTER (WHERE r_inactive) AS i FROM flagged", p,
                (rs, i) -> new FilterCounts(rs.getLong("a"), rs.getLong("t"), rs.getLong("i")));
        long total = switch (filter) {
            case ATTENTION -> counts.attention();
            case INACTIVE14 -> counts.inactive14();
            case ALL -> counts.all();
        };
        return new OwnerPage(rows, page, size, total, (int) ((total + size - 1) / size), counts);
    }

    /** The Owners tab badge: how many owners need help. Polled, not audited. */
    public long needHelpCount() {
        MapSqlParameterSource p = AttentionRules.params(props.attention(), clock.instant());
        Long n = jdbc.queryForObject(AttentionRules.flaggedOwnersCte("") + "SELECT count(*) FROM flagged WHERE "
                + AttentionRules.NEEDS_HELP_SQL, p, Long.class);
        return n == null ? 0 : n;
    }

    private static final RowMapper<OwnerRow> OWNER_ROW = (rs, i) -> new OwnerRow(
            rs.getObject("id", UUID.class), rs.getString("full_name"), rs.getString("email"),
            rs.getString("contact_phone"), Times.instant(rs.getTimestamp("created_at")),
            Times.instant(rs.getTimestamp("last_seen_at")), rs.getTimestamp("email_verified_at") != null,
            new Counts(rs.getLong("properties"), rs.getLong("units"), rs.getLong("reservations")),
            AttentionRules.reasons(rs),
            rs.getLong("calendars") == 0 ? "NONE" : rs.getBoolean("sync_failing") ? "FAILING" : "OK");

    // ---------- one owner ----------

    /** The listed owner with this user id, or 404 (unknown, admin or demo). */
    public UUID ownerIdOf(UUID userId) {
        List<UUID> ids = jdbc.query("SELECT u.owner_id FROM app_user u JOIN owner o ON o.id = u.owner_id "
                        + "WHERE u.id = :id AND u.is_admin = FALSE AND o.demo = FALSE",
                new MapSqlParameterSource("id", userId), (rs, i) -> rs.getObject(1, UUID.class));
        if (ids.isEmpty()) throw new NoSuchElementException("Owner not found");
        return ids.getFirst();
    }

    public OwnerDetail owner(UUID userId) {
        Instant now = clock.instant();
        MapSqlParameterSource p = AttentionRules.params(props.attention(), now).addValue("id", userId);
        List<OwnerDetail> found = jdbc.query(AttentionRules.flaggedOwnersCte("AND u.id = :id") + "SELECT * FROM flagged", p,
                (rs, i) -> detail(rs, now));
        if (found.isEmpty()) throw new NoSuchElementException("Owner not found");
        return found.getFirst();
    }

    private OwnerDetail detail(ResultSet rs, Instant now) throws SQLException {
        UUID ownerId = rs.getObject("owner_id", UUID.class);
        Instant registered = Times.instant(rs.getTimestamp("created_at"));
        Instant lastSeen = Times.instant(rs.getTimestamp("last_seen_at"));
        long units = rs.getLong("units");
        long reservations = rs.getLong("reservations");
        long calendars = rs.getLong("calendars");
        List<Reason> reasons = new ArrayList<>();
        for (String code : AttentionRules.reasons(rs)) {
            String text = switch (code) {
                case AttentionRules.SYNC_FAILING -> syncText(ownerId, now);
                case AttentionRules.OPEN_CONFLICTS -> conflictText(ownerId);
                case AttentionRules.EMAIL_BOUNCED -> rs.getLong("email_problems") + (rs.getLong("email_problems") == 1
                        ? " email" : " emails") + " failed, bounced or were marked as spam in the last "
                        + props.attention().emailProblemDays() + " days.";
                case AttentionRules.UNVERIFIED_24H -> "Email not verified, registered " + ago(registered, now) + ".";
                case AttentionRules.STUCK_ONBOARDING -> units == 0
                        ? "No units yet, registered " + ago(registered, now) + "."
                        : "No reservations and no calendar connected, registered " + ago(registered, now) + ".";
                case AttentionRules.INACTIVE_14D -> lastSeen == null ? "Never used the app since registering "
                        + ago(registered, now) + "." : "Last seen " + ago(lastSeen, now) + ".";
                default -> code;
            };
            reasons.add(new Reason(code, text));
        }
        return new OwnerDetail(rs.getObject("id", UUID.class), rs.getString("full_name"), rs.getString("email"),
                rs.getString("contact_phone"), registered, lastSeen, Times.instant(rs.getTimestamp("last_login_at")),
                rs.getTimestamp("email_verified_at") != null, Times.instant(rs.getTimestamp("email_verified_at")),
                new Counts(rs.getLong("properties"), units, reservations), calendars,
                rs.getLong("open_conflicts"), reasons);
    }

    private String syncText(UUID ownerId, Instant now) {
        MapSqlParameterSource p = AttentionRules.params(props.attention(), now).addValue("owner", ownerId);
        List<String> parts = jdbc.query("SELECT x.name, c.platform, c.consecutive_failures, c.last_success_at, c.last_error_at "
                + "FROM external_calendar c JOIN unit x ON x.id = c.unit_id WHERE x.owner_id = :owner AND ("
                + "c.consecutive_failures >= :syncFailures OR (c.last_success_at IS NOT NULL AND c.last_success_at < :syncStale) "
                + "OR (c.last_success_at IS NULL AND c.created_at < :syncStaleLocal)) ORDER BY x.name", p, (rs, i) -> {
            String where = rs.getString("name") + " (" + platformName(rs.getString("platform")) + ")";
            int failures = rs.getInt("consecutive_failures");
            Instant lastSuccess = Times.instant(rs.getTimestamp("last_success_at"));
            if (failures >= props.attention().syncFailures()) {
                return where + " failed " + failures + " times in a row"
                        + (lastSuccess == null ? ", never synced." : ", last success " + day(lastSuccess) + ".");
            }
            return where + (lastSuccess == null ? " has never synced." : " has not synced since " + day(lastSuccess) + ".");
        });
        return parts.isEmpty() ? "A calendar is not syncing." : String.join(" ", parts);
    }

    private String conflictText(UUID ownerId) {
        List<String> parts = jdbc.query("SELECT x.name, count(*) AS n FROM sync_conflict s JOIN unit x ON x.id = s.unit_id "
                        + "WHERE s.owner_id = :owner AND s.status = 'OPEN' GROUP BY x.name ORDER BY x.name",
                new MapSqlParameterSource("owner", ownerId),
                (rs, i) -> rs.getLong("n") + " open double booking" + (rs.getLong("n") == 1 ? "" : "s") + " on "
                        + rs.getString("name") + ".");
        return parts.isEmpty() ? "Open double booking." : String.join(" ", parts);
    }

    static String platformName(String platform) {
        return "BOOKING".equals(platform) ? "Booking.com" : "imported calendar";
    }

    private static String day(Instant i) {
        return DAY.format(i.atZone(ZoneOffset.UTC));
    }

    static String ago(Instant then, Instant now) {
        if (then == null) return "at an unknown time";
        long days = Duration.between(then, now).toDays();
        if (days >= 1) return days + (days == 1 ? " day ago" : " days ago");
        long hours = Duration.between(then, now).toHours();
        return hours >= 1 ? hours + (hours == 1 ? " hour ago" : " hours ago") : "less than an hour ago";
    }

    public ReservationPage reservations(UUID userId, String sort, int page, int size) {
        checkPaging(page, size);
        UUID ownerId = ownerIdOf(userId);
        String order = "checkin".equals(sort) ? "lower(r.stay_range) DESC, r.id"
                : "coalesce(r.updated_at, r.created_at) DESC NULLS LAST, r.id";
        if (sort != null && !sort.equals("checkin") && !sort.equals("changed")) {
            throw new IllegalArgumentException("sort must be changed or checkin");
        }
        MapSqlParameterSource p = new MapSqlParameterSource("owner", ownerId)
                .addValue("limit", size).addValue("offset", (long) page * size);
        List<ReservationRow> items = jdbc.query("SELECT r.id, x.name AS unit, pr.name AS property, r.guest_name, "
                + "lower(r.stay_range) AS ci, upper(r.stay_range) AS co, r.status, r.source, r.total_amount, "
                + "r.created_at, r.updated_at, imp.platform AS imported_from "
                + "FROM reservation r JOIN unit x ON x.id = r.unit_id JOIN property pr ON pr.id = x.property_id "
                + "LEFT JOIN LATERAL (SELECT c.platform FROM external_event e JOIN external_calendar c "
                + "  ON c.id = e.external_calendar_id WHERE e.reservation_id = r.id LIMIT 1) imp ON TRUE "
                + "WHERE r.owner_id = :owner ORDER BY " + order + " LIMIT :limit OFFSET :offset", p, (rs, i) -> {
            String importedFrom = rs.getString("imported_from");
            String source = rs.getString("source");
            boolean imported = importedFrom != null || !"DIRECT".equals(source);
            java.math.BigDecimal price = rs.getBigDecimal("total_amount");
            return new ReservationRow(rs.getObject("id", UUID.class), rs.getString("unit"), rs.getString("property"),
                    rs.getString("guest_name"), rs.getObject("ci", LocalDate.class), rs.getObject("co", LocalDate.class),
                    rs.getString("status"), source, imported,
                    imported ? platformName(importedFrom != null ? importedFrom : source) : null, price,
                    imported && (price == null || price.signum() == 0),
                    Times.instant(rs.getTimestamp("created_at")), Times.instant(rs.getTimestamp("updated_at")));
        });
        Long total = jdbc.queryForObject("SELECT count(*) FROM reservation WHERE owner_id = :owner", p, Long.class);
        long t = total == null ? 0 : total;
        return new ReservationPage(items, page, size, t, (long) (page + 1) * size < t);
    }

    public List<UnitCalendars> calendars(UUID userId) {
        UUID ownerId = ownerIdOf(userId);
        MapSqlParameterSource p = AttentionRules.params(props.attention(), clock.instant()).addValue("owner", ownerId);
        Map<UUID, UnitCalendars> units = new LinkedHashMap<>();
        jdbc.query("SELECT x.id, x.name, pr.name AS property, (x.ical_token IS NOT NULL) AS feed FROM unit x "
                + "JOIN property pr ON pr.id = x.property_id WHERE x.owner_id = :owner ORDER BY pr.name, x.name", p, rs -> {
            UUID id = rs.getObject("id", UUID.class);
            units.put(id, new UnitCalendars(id, rs.getString("name"), rs.getString("property"), rs.getBoolean("feed"),
                    new ArrayList<>()));
        });
        jdbc.query("SELECT c.id, c.unit_id, c.platform, c.ics_url, c.last_synced_at, c.last_success_at, c.last_error_at, "
                + "c.last_error_message, c.consecutive_failures, "
                + "(c.consecutive_failures >= :syncFailures OR (c.last_success_at IS NOT NULL AND c.last_success_at < :syncStale) "
                + " OR (c.last_success_at IS NULL AND c.created_at < :syncStaleLocal)) AS failing, "
                + "(SELECT count(*) FROM external_event e WHERE e.external_calendar_id = c.id AND e.reservation_id IS NOT NULL) AS imported "
                + "FROM external_calendar c JOIN unit x ON x.id = c.unit_id WHERE x.owner_id = :owner ORDER BY c.created_at", p, rs -> {
            UnitCalendars u = units.get(rs.getObject("unit_id", UUID.class));
            if (u == null) return;
            u.calendars().add(new CalendarRow(rs.getObject("id", UUID.class), rs.getString("platform"),
                    hostOf(rs.getString("ics_url")), Times.instant(rs.getTimestamp("last_synced_at")),
                    Times.instant(rs.getTimestamp("last_success_at")), Times.instant(rs.getTimestamp("last_error_at")),
                    rs.getString("last_error_message"), rs.getInt("consecutive_failures"), rs.getLong("imported"),
                    rs.getBoolean("failing")));
        });
        return List.copyOf(units.values());
    }

    /** Only the host of a calendar link; never the path or query, which hold the secret. */
    static String hostOf(String url) {
        try {
            String host = URI.create(url == null ? "" : url.trim()).getHost();
            return host == null ? "unknown host" : host.toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return "unknown host";
        }
    }

    public EmailPage emails(UUID userId, int page, int size) {
        checkPaging(page, size);
        UUID ownerId = ownerIdOf(userId);
        String email = jdbc.queryForObject("SELECT email FROM app_user WHERE id = :id",
                new MapSqlParameterSource("id", userId), String.class);
        MapSqlParameterSource p = new MapSqlParameterSource("owner", ownerId).addValue("email", email)
                .addValue("limit", size).addValue("offset", (long) page * size);
        String where = "WHERE (owner_id = :owner OR lower(to_address) = lower(:email))";
        List<EmailRow> items = jdbc.query("SELECT id, type, status, subject, to_address, created_at, updated_at, "
                + "sent_by_admin_id, body IS NOT NULL AS has_body FROM email_log " + where
                + " ORDER BY created_at DESC, id LIMIT :limit OFFSET :offset", p, (rs, i) -> new EmailRow(
                rs.getObject("id", UUID.class), rs.getString("type"), rs.getString("status"), rs.getString("subject"),
                rs.getString("to_address"), Times.instant(rs.getTimestamp("created_at")),
                Times.instant(rs.getTimestamp("updated_at")), rs.getObject("sent_by_admin_id") != null,
                rs.getBoolean("has_body")));
        Long total = jdbc.queryForObject("SELECT count(*) FROM email_log " + where, p, Long.class);
        long t = total == null ? 0 : total;
        return new EmailPage(items, page, size, t, (long) (page + 1) * size < t);
    }

    /** The stored text of an admin-written email to this owner; 404 for anything else. */
    public EmailBody emailBody(UUID userId, UUID emailId) {
        UUID ownerId = ownerIdOf(userId);
        List<EmailBody> found = jdbc.query("SELECT e.id, e.subject, e.body FROM email_log e JOIN app_user u ON u.id = :user "
                        + "WHERE e.id = :id AND e.type = 'ADMIN_MESSAGE' AND e.body IS NOT NULL "
                        + "AND (e.owner_id = :owner OR lower(e.to_address) = lower(u.email))",
                new MapSqlParameterSource("id", emailId).addValue("owner", ownerId).addValue("user", userId),
                (rs, i) -> new EmailBody(rs.getObject("id", UUID.class), rs.getString("subject"), rs.getString("body")));
        if (found.isEmpty()) throw new NoSuchElementException("Email not found");
        return found.getFirst();
    }

    // ---------- audit ----------

    public AuditPage audit(int page, int size) {
        checkPaging(page, size);
        MapSqlParameterSource p = new MapSqlParameterSource("limit", size).addValue("offset", (long) page * size);
        List<AuditEntry> items = jdbc.query(AUDIT_SELECT + " ORDER BY a.created_at DESC, a.id LIMIT :limit OFFSET :offset",
                p, AUDIT_ROW);
        Long total = jdbc.queryForObject("SELECT count(*) FROM admin_audit_log", p, Long.class);
        long t = total == null ? 0 : total;
        return new AuditPage(items, page, size, t, (int) ((t + size - 1) / size));
    }

    private static final String AUDIT_SELECT = "SELECT a.id, a.action, a.target_user_id, u.full_name AS target_name, "
            + "a.details::text AS details, a.created_at FROM admin_audit_log a LEFT JOIN app_user u ON u.id = a.target_user_id";

    private static final RowMapper<AuditEntry> AUDIT_ROW = (rs, i) -> new AuditEntry(rs.getObject("id", UUID.class),
            rs.getString("action"), rs.getObject("target_user_id", UUID.class), rs.getString("target_name"),
            parse(rs.getString("details")), Times.instant(rs.getTimestamp("created_at")));

    private static Map<String, Object> parse(String json) {
        if (json == null) return Map.of();
        try {
            return JSON.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    // ---------- overview ----------

    public Overview overview(List<Reminder> remindersDue) {
        Instant now = clock.instant();
        MapSqlParameterSource p = AttentionRules.params(props.attention(), now)
                .addValue("d7Local", Times.local(now.minus(Duration.ofDays(7))))
                .addValue("d14Local", Times.local(now.minus(Duration.ofDays(14))))
                .addValue("d30Local", Times.local(now.minus(Duration.ofDays(30))))
                .addValue("d7", Times.utc(now.minus(Duration.ofDays(7))))
                .addValue("nowLocal", Times.local(now));
        String cte = AttentionRules.flaggedOwnersCte("");
        Map<String, Object> s = jdbc.queryForMap(cte + "SELECT count(*) AS total,"
                + " count(*) FILTER (WHERE created_at >= :d7Local AND created_at <= :nowLocal) AS new7,"
                + " count(*) FILTER (WHERE created_at >= :d14Local AND created_at < :d7Local) AS prev7,"
                + " count(*) FILTER (WHERE last_seen_at >= :d7) AS active7,"
                + " count(*) FILTER (WHERE " + AttentionRules.NEEDS_HELP_SQL + ") AS need,"
                + " count(*) FILTER (WHERE r_sync) AS sync, count(*) FILTER (WHERE r_conflicts) AS conflicts,"
                + " count(*) FILTER (WHERE r_email) AS email, count(*) FILTER (WHERE r_unverified) AS unverified,"
                + " count(*) FILTER (WHERE r_stuck) AS stuck, count(*) FILTER (WHERE r_inactive) AS inactive,"
                + " count(*) FILTER (WHERE created_at >= :d30Local AND created_at <= :nowLocal) AS f_registered,"
                + " count(*) FILTER (WHERE created_at >= :d30Local AND created_at <= :nowLocal AND email_verified_at IS NOT NULL) AS f_verified,"
                + " count(*) FILTER (WHERE created_at >= :d30Local AND created_at <= :nowLocal AND properties > 0) AS f_property,"
                + " count(*) FILTER (WHERE created_at >= :d30Local AND created_at <= :nowLocal AND units > 0) AS f_unit,"
                + " count(*) FILTER (WHERE created_at >= :d30Local AND created_at <= :nowLocal AND calendars > 0) AS f_calendar,"
                + " count(*) FILTER (WHERE created_at >= :d30Local AND created_at <= :nowLocal AND reservations > 0) AS f_reservation"
                + " FROM flagged", p);

        Map<String, Long> byReason = new LinkedHashMap<>();
        byReason.put(AttentionRules.SYNC_FAILING, n(s, "sync"));
        byReason.put(AttentionRules.OPEN_CONFLICTS, n(s, "conflicts"));
        byReason.put(AttentionRules.EMAIL_BOUNCED, n(s, "email"));
        byReason.put(AttentionRules.UNVERIFIED_24H, n(s, "unverified"));
        byReason.put(AttentionRules.STUCK_ONBOARDING, n(s, "stuck"));

        long registered = n(s, "f_registered");
        List<FunnelStep> funnel = List.of(
                step("registered", registered, registered), step("emailVerified", n(s, "f_verified"), registered),
                step("propertyAdded", n(s, "f_property"), registered), step("unitAdded", n(s, "f_unit"), registered),
                step("calendarConnected", n(s, "f_calendar"), registered),
                step("firstReservation", n(s, "f_reservation"), registered));

        List<OwnerRow> top = owners(null, Filter.ATTENTION, Sort.URGENCY, 0, 5).items();
        List<AuditEntry> latest = jdbc.query(AUDIT_SELECT + " ORDER BY a.created_at DESC, a.id LIMIT 5",
                new MapSqlParameterSource(), AUDIT_ROW);
        return new Overview(n(s, "new7"), n(s, "prev7"), n(s, "active7"), n(s, "total"),
                new NeedHelp(n(s, "need"), byReason), n(s, "inactive"), top, remindersDue, funnel,
                funnel.getLast().percent(), registered, latest, system.status());
    }

    private static long n(Map<String, Object> row, String key) {
        Object v = row.get(key);
        return v == null ? 0 : ((Number) v).longValue();
    }

    private static FunnelStep step(String key, long count, long of) {
        return new FunnelStep(key, count, of == 0 ? 0 : (int) Math.round(count * 100.0 / of));
    }
}
