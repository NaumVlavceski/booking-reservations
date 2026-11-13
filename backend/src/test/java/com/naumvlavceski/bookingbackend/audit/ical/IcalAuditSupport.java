package com.naumvlavceski.bookingbackend.audit.ical;

import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import com.naumvlavceski.bookingbackend.mail.EmailLogRepository;
import com.naumvlavceski.bookingbackend.model.EmailLog;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import com.naumvlavceski.bookingbackend.repository.ExternalEventRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.SyncConflictRepository;
import com.naumvlavceski.bookingbackend.service.IcalSyncService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * End-to-end iCal import against the real Spring context and the real Postgres schema (Testcontainers + Flyway).
 * The feed comes from a {@link StubFeedServer} on 127.0.0.1, never from Booking.com.
 *
 * <p>Calendars are inserted through the repository, because the API only accepts *.booking.com links (and would
 * resolve them in DNS). The fact that a sync then happily fetches a plain-http loopback URL is itself finding
 * ICAL-03 (the SSRF guard is not re-applied at sync time).
 *
 * <p>The scheduler is live in tests (every 60 s, calendars not synced for 10 min). New calendars get
 * lastSyncedAt = now - 2 min: not due for the scheduler, but past the 60 s manual-sync cooldown.
 */
public abstract class IcalAuditSupport extends AuditTestBase {

    @Autowired protected ExternalCalendarRepository calendars;
    @Autowired protected ExternalEventRepository events;
    @Autowired protected ReservationRepository reservations;
    @Autowired protected SyncConflictRepository conflicts;
    @Autowired protected IcalSyncService syncService;
    @Autowired protected com.naumvlavceski.bookingbackend.ical.IcalFetchGuard fetchGuard;
    @Autowired protected EmailLogRepository emailLogs;
    @Autowired protected JdbcTemplate jdbc;

    protected StubFeedServer stub;

    @BeforeEach
    void startStub() throws Exception {
        stub = new StubFeedServer();
        // Since the ICAL-03 fix every sync re-checks the URL; the stub on 127.0.0.1 is let through in tests only
        fetchGuard.allowLoopbackStubsInTests(true);
    }

    @AfterEach
    void stopStub() {
        stub.close();
        fetchGuard.allowLoopbackStubsInTests(false); // the Spring context is shared with other test classes
    }

    /** An owner with one room. */
    public record Room(TestOwner owner, String roomId, UUID ownerId) {
        public String token() { return owner.token(); }
        public UUID unitId() { return UUID.fromString(roomId); }
    }

    protected Room newOwnerRoom() throws Exception {
        TestOwner owner = newOwner();
        String room = newRoom(owner.token());
        UUID ownerId = appUsers.findFirstByEmailIgnoreCase(owner.email()).orElseThrow().getOwner().getId();
        return new Room(owner, room, ownerId);
    }

    /** Connects a Booking.com calendar whose feed is the stub's {@code path}. */
    protected UUID connect(Room room, String path) {
        return connectUrl(room, stub.url(path));
    }

    protected UUID connectUrl(Room room, String url) {
        ExternalCalendar c = new ExternalCalendar();
        c.setUnitId(room.unitId());
        c.setPlatform(ReservationSource.BOOKING);
        c.setIcsUrl(url);
        c.setLastSyncedAt(Instant.now().minus(Duration.ofMinutes(2)));
        return calendars.save(c).getId();
    }

    /** Lets the next manual sync pass the 60 s cooldown (and keeps the calendar away from the scheduler). */
    protected void endCooldown(UUID calendarId) {
        jdbc.update("update external_calendar set last_synced_at = now() - interval '2 minutes' where id = ?", calendarId);
    }

    protected ExternalCalendar calendarRow(UUID id) {
        return calendars.findById(id).orElseThrow();
    }

    /** Every reservation of the room, oldest check-in first. */
    protected List<Map<String, Object>> rows(Room room) {
        return jdbc.queryForList("""
                select id, lower(stay_range) as check_in, upper(stay_range) as check_out, status, source, guest_name,
                       guests_count, total_amount, nightly_rate, price_per_guest, price_needs_review, cancelled_at
                from reservation where unit_id = ? order by lower(stay_range), created_at""", room.unitId());
    }

    protected List<Map<String, Object>> activeRows(Room room) {
        return rows(room).stream().filter(r -> !"CANCELLED".equals(r.get("status"))).toList();
    }

    protected Map<String, Object> reservation(UUID id) {
        return jdbc.queryForMap("""
                select id, lower(stay_range) as check_in, upper(stay_range) as check_out, status, source, guest_name,
                       total_amount, nightly_rate, guests_count, notes
                from reservation where id = ?""", id);
    }

    protected int eventCount(UUID calendarId) {
        return events.findAllByExternalCalendarId(calendarId).size();
    }

    protected long emails(UUID ownerId, String type) {
        return emailLogs.findAll().stream()
                .filter(e -> ownerId.equals(e.getOwnerId()) && type.equals(e.getType()))
                .count();
    }

    protected List<EmailLog> emailsOf(UUID ownerId) {
        return emailLogs.findAll().stream().filter(e -> ownerId.equals(e.getOwnerId())).toList();
    }

    /** Emails go out after commit on a background executor: wait for them. */
    protected long awaitEmails(UUID ownerId, String type, long expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 8_000;
        long n = emails(ownerId, type);
        while (n < expected && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
            n = emails(ownerId, type);
        }
        return n;
    }

    /** Gives stray async emails time to arrive before asserting that none did. */
    protected static void settle() throws InterruptedException {
        Thread.sleep(1_500);
    }

    protected static LocalDate inDays(int days) {
        return LocalDate.now().plusDays(days);
    }
}
