package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.admin.AdminDtos.Note;
import com.naumvlavceski.bookingbackend.admin.AdminDtos.Reminder;
import com.naumvlavceski.bookingbackend.admin.AttentionRules.Times;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/** The admin's private notes about an owner (admin_note), with an optional reminder date. */
@Service
@Transactional
public class AdminNoteService {
    public static final int MAX_TEXT = 4000;

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public AdminNoteService(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    private static final RowMapper<Note> NOTE = (rs, i) -> new Note(rs.getObject("id", UUID.class),
            rs.getObject("owner_user_id", UUID.class), rs.getString("text"), rs.getObject("remind_on", LocalDate.class),
            Times.instant(rs.getTimestamp("done_at")), Times.instant(rs.getTimestamp("created_at")),
            Times.instant(rs.getTimestamp("updated_at")));

    static String checkText(String text) {
        String t = text == null ? "" : text.strip();
        if (t.isEmpty()) throw new IllegalArgumentException("Write something in the note.");
        if (t.length() > MAX_TEXT) throw new IllegalArgumentException("A note can be at most " + MAX_TEXT + " characters.");
        return t;
    }

    @Transactional(readOnly = true)
    public List<Note> list(UUID ownerUserId) {
        return jdbc.query("SELECT * FROM admin_note WHERE owner_user_id = :o ORDER BY done_at IS NOT NULL, created_at DESC",
                new MapSqlParameterSource("o", ownerUserId), NOTE);
    }

    public Note create(UUID ownerUserId, UUID adminUserId, String text, LocalDate remindOn) {
        UUID id = UUID.randomUUID();
        var now = Times.utc(clock.instant());
        jdbc.update("INSERT INTO admin_note (id, owner_user_id, text, remind_on, created_by_user_id, created_at, updated_at) "
                + "VALUES (:id, :o, :t, :r, :a, :now, :now)", new MapSqlParameterSource("id", id).addValue("o", ownerUserId)
                .addValue("t", checkText(text)).addValue("r", remindOn).addValue("a", adminUserId).addValue("now", now));
        return get(id);
    }

    /** Replaces text, reminder date and done state (the panel always sends all three). */
    public Note update(UUID noteId, String text, LocalDate remindOn, boolean done) {
        Note current = get(noteId);
        var now = Times.utc(clock.instant());
        jdbc.update("UPDATE admin_note SET text = :t, remind_on = :r, done_at = :d, updated_at = :now WHERE id = :id",
                new MapSqlParameterSource("id", noteId).addValue("t", checkText(text)).addValue("r", remindOn)
                        .addValue("d", done ? (current.doneAt() != null ? Times.utc(current.doneAt()) : now) : null)
                        .addValue("now", now));
        return get(noteId);
    }

    public Note delete(UUID noteId) {
        Note current = get(noteId);
        jdbc.update("DELETE FROM admin_note WHERE id = :id", new MapSqlParameterSource("id", noteId));
        return current;
    }

    @Transactional(readOnly = true)
    public Note get(UUID noteId) {
        List<Note> found = jdbc.query("SELECT * FROM admin_note WHERE id = :id", new MapSqlParameterSource("id", noteId), NOTE);
        if (found.isEmpty()) throw new NoSuchElementException("Note not found");
        return found.getFirst();
    }

    /** Open notes whose reminder is today or earlier (UTC), oldest first; admin and demo owners never appear. */
    @Transactional(readOnly = true)
    public List<Reminder> due(int limit) {
        return jdbc.query("SELECT n.id, n.owner_user_id, u.full_name, u.email, n.text, n.remind_on FROM admin_note n "
                        + "JOIN app_user u ON u.id = n.owner_user_id JOIN owner o ON o.id = u.owner_id "
                        + "WHERE n.done_at IS NULL AND n.remind_on <= :today AND u.is_admin = FALSE AND o.demo = FALSE "
                        + "ORDER BY n.remind_on, n.created_at LIMIT :limit",
                new MapSqlParameterSource("today", LocalDate.now(clock.withZone(ZoneOffset.UTC))).addValue("limit", limit),
                (rs, i) -> new Reminder(rs.getObject("id", UUID.class), rs.getObject("owner_user_id", UUID.class),
                        rs.getString("full_name"), rs.getString("email"), rs.getString("text"),
                        rs.getObject("remind_on", LocalDate.class)));
    }
}
