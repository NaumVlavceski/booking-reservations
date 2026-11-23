package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.admin.AdminDtos.SystemStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * GET /api/admin/system and the Overview's status line. The last backup is read from APP_ADMIN_BACKUP_DIR only if it
 * is set, mounted and readable (newest regular file: age and size); otherwise "UNKNOWN". Older than 36 hours: STALE,
 * shown red. Nothing here writes anything.
 */
@Slf4j
@Service
public class SystemStatusService {
    static final Duration BACKUP_MAX_AGE = Duration.ofHours(36);

    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final AdminProperties props;
    private final ObjectProvider<BuildProperties> build;

    public SystemStatusService(JdbcTemplate jdbc, Clock clock, AdminProperties props, ObjectProvider<BuildProperties> build) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.props = props;
        this.build = build;
    }

    public SystemStatus status() {
        Instant now = clock.instant();
        String version = Optional.ofNullable(build.getIfAvailable()).map(BuildProperties::getVersion)
                .orElseGet(() -> Optional.ofNullable(getClass().getPackage().getImplementationVersion()).orElse("unknown"));
        String flyway = jdbc.query("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1",
                (rs, i) -> rs.getString(1)).stream().findFirst().orElse(null);
        Long dbBytes = jdbc.queryForObject("SELECT pg_database_size(current_database())", Long.class);

        Long free = null;
        Long total = null;
        File disk = new File(props.diskPath());
        if (disk.exists()) {
            free = disk.getUsableSpace();
            total = disk.getTotalSpace();
        }

        Long failedEmails = jdbc.queryForObject("SELECT count(*) FROM email_log WHERE status IN ('FAILED', 'BOUNCED', 'COMPLAINED') "
                + "AND created_at >= ?", Long.class, AttentionRules.Times.utc(now.minus(Duration.ofHours(24))));
        Long failingCalendars = jdbc.queryForObject("SELECT count(*) FROM external_calendar c JOIN unit x ON x.id = c.unit_id "
                + "JOIN owner o ON o.id = x.owner_id WHERE o.demo = FALSE AND c.consecutive_failures >= ?",
                Long.class, props.attention().syncFailures());

        Backup backup = lastBackup(now);
        long emails = failedEmails == null ? 0 : failedEmails;
        long calendars = failingCalendars == null ? 0 : failingCalendars;
        boolean lowDisk = free != null && total != null && total > 0 && free * 10 < total;
        String state = "STALE".equals(backup.state()) || lowDisk ? "ERROR"
                : (emails > 0 || calendars > 0 || "UNKNOWN".equals(backup.state())) ? "WARNING" : "OK";
        return new SystemStatus(state, version, flyway, dbBytes, free, total, emails, calendars,
                backup.state(), backup.at(), backup.bytes());
    }

    record Backup(String state, Instant at, Long bytes) {}

    Backup lastBackup(Instant now) {
        String dir = props.backupDir();
        if (dir == null || dir.isBlank()) return new Backup("UNKNOWN", null, null);
        Path path = Path.of(dir);
        if (!Files.isDirectory(path) || !Files.isReadable(path)) return new Backup("UNKNOWN", null, null);
        try (Stream<Path> files = Files.list(path)) {
            Optional<Path> newest = files.filter(Files::isRegularFile)
                    .max(Comparator.comparing(p -> p.toFile().lastModified()));
            if (newest.isEmpty()) return new Backup("UNKNOWN", null, null);
            Instant at = Instant.ofEpochMilli(newest.get().toFile().lastModified());
            long size = Files.size(newest.get());
            return new Backup(at.isBefore(now.minus(BACKUP_MAX_AGE)) ? "STALE" : "OK", at, size);
        } catch (IOException | SecurityException e) {
            log.debug("Backup directory not readable: {}", e.toString());
            return new Backup("UNKNOWN", null, null);
        }
    }
}
