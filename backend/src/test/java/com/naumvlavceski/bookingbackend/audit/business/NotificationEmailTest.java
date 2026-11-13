package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.ical.IcalReconciler;
import com.naumvlavceski.bookingbackend.ical.ParseResult;
import com.naumvlavceski.bookingbackend.ical.ParsedIcalEvent;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.UnsubscribeLinks;
import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.repository.ExternalCalendarRepository;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.lang.reflect.Constructor;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 3.10: booking emails. The sender is replaced by {@link CapturingEmailSender}; nothing leaves the machine.
 * Reconciler-triggered emails are produced by calling the real IcalReconciler with a parsed feed (no download): the
 * test calendar points at a .invalid host and is marked as just synced, so the scheduler never fetches it.
 */
class NotificationEmailTest extends BusinessTestBase {

    private static final Duration WAIT = Duration.ofSeconds(10);

    @Autowired IcalReconciler reconciler;
    @Autowired ExternalCalendarRepository calendars;

    private ExternalCalendar calendarFor(String unitId) {
        ExternalCalendar c = new ExternalCalendar();
        c.setUnitId(UUID.fromString(unitId));
        c.setPlatform(ReservationSource.BOOKING);
        c.setIcsUrl("https://feed.audit.invalid/never-fetched.ics");
        c.setLastSuccessAt(Instant.now().minus(Duration.ofHours(1)));      // not the first sync: new arrivals are news
        c.setLastSyncedAt(Instant.now().plus(Duration.ofDays(3650)));      // never due for IcalSyncScheduler
        return calendars.save(c);
    }

    private void importEvent(ExternalCalendar c, String uid, String in, String out, String summary) {
        reconciler.reconcile(c, ParseResult.complete(List.of(new ParsedIcalEvent(uid + "@booking.com",
                LocalDate.parse(in), LocalDate.parse(out), summary, "BEGIN:VEVENT\r\nUID:" + uid + "\r\nEND:VEVENT"))));
    }

    private int logRows(String ownerId, String type) {
        return jdbc.queryForObject("SELECT count(*) FROM email_log WHERE owner_id = ?::uuid AND type = ?",
                Integer.class, ownerId, type);
    }

    @Test
    void theNotificationSwitchTurnsReconcilerEmailsOnAndOff() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        String ownerId = ownerIdOfUnit(room);
        ExternalCalendar cal = calendarFor(room);

        importEvent(cal, "on-1", "2032-03-01", "2032-03-03", "Guest On One");
        EmailMessage first = mailbox.await(o.email(), m -> m.text().contains("Guest On One"), WAIT);
        assertNotNull(first, "notifications are on by default");
        assertEquals("New Booking reservation: House / Room 1", first.subject());

        putJson("/api/notifications/settings", o.token(), "{\"enabled\":false}").andExpect(status().isOk());
        importEvent(cal, "off-1", "2032-04-01", "2032-04-03", "Guest Off");
        assertNull(mailbox.await(o.email(), m -> m.text().contains("Guest Off"), Duration.ofSeconds(2)));
        assertEquals(1, liveCountByGuest(room, "Guest Off")); // the booking itself was still imported

        putJson("/api/notifications/settings", o.token(), "{\"enabled\":true}").andExpect(status().isOk());
        importEvent(cal, "on-2", "2032-05-01", "2032-05-03", "Guest On Two");
        assertNotNull(mailbox.await(o.email(), m -> m.text().contains("Guest On Two"), WAIT));

        Thread.sleep(300); // the log row is written right after the send, on the mail thread
        assertEquals(2, logRows(ownerId, "EXTERNAL_RESERVATION_IMPORTED"));
    }

    private int liveCountByGuest(String unitId, String guest) {
        return jdbc.queryForObject("SELECT count(*) FROM reservation WHERE unit_id = ?::uuid AND guest_name = ? AND status <> 'CANCELLED'",
                Integer.class, unitId, guest);
    }

    /** Documents current behaviour: the test email is sent even when booking notifications are off (it is asked for). */
    @Test
    void theTestEmailIsSentWhateverTheSwitchSaysAndOncePerMinute() throws Exception {
        TestOwner o = newOwner();
        putJson("/api/notifications/settings", o.token(), "{\"enabled\":false}").andExpect(status().isOk());
        send(post("/api/notifications/test"), o.token(), null).andExpect(status().isAccepted());
        EmailMessage m = mailbox.await(o.email(), x -> x.subject().equals("RoomTrack test email"), WAIT);
        assertNotNull(m);
        assertFalse(m.html().contains("localhost"));
        send(post("/api/notifications/test"), o.token(), null).andExpect(status().isTooManyRequests());
    }

    @Test
    void namesFromOwnersAndFeedsAreHtmlEscapedInTheBody() throws Exception {
        TestOwner o = newOwner();
        String p = createPropertyNamed(o.token(), "Villa <script>alert(1)</script>", 1);
        String room = roomIds(o.token(), p).getFirst();
        renameRoom(o.token(), room, "Room <b onmouseover=alert(2)>1</b>");
        ExternalCalendar cal = calendarFor(room);
        importEvent(cal, "xss-1", "2032-06-01", "2032-06-04", "<img src=x onerror=alert(1)>");

        EmailMessage m = mailbox.await(o.email(), x -> x.text().contains("onerror"), WAIT);
        assertNotNull(m);
        assertTrue(m.html().contains("&lt;img src=x onerror=alert(1)&gt;"), m.html());
        assertTrue(m.html().contains("Villa &lt;script&gt;alert(1)&lt;/script&gt;"), m.html());
        assertTrue(m.html().contains("Room &lt;b onmouseover=alert(2)&gt;1&lt;/b&gt;"), m.html());
        assertFalse(m.html().contains("<img") || m.html().contains("<script") || m.html().contains("<b onmouseover"), m.html());
        assertFalse(m.subject().contains("onerror"), "the guest name is not part of the subject");

        // conflict email: the existing (owner-typed) guest name is escaped too
        createReservation(o.token(), room, "2032-07-01", "2032-07-05", "\"guestName\":" + js("<svg onload=alert(3)>"));
        importEvent(cal, "xss-2", "2032-07-02", "2032-07-03", "Overlapping");
        EmailMessage c = mailbox.await(o.email(), x -> x.subject().startsWith("Booking conflict"), WAIT);
        assertNotNull(c);
        assertTrue(c.html().contains("&lt;svg onload=alert(3)&gt;"), c.html());
        assertFalse(c.html().contains("<svg"), c.html());
    }

    // Finding BIZ-03: CR/LF typed into a property or room name reach the email Subject unchanged.
    @Tag("open-finding")
    @Test
    void lineBreaksInNamesNeverReachTheSubject() throws Exception {
        TestOwner o = newOwner();
        String p = createPropertyNamed(o.token(), "Villa\r\nBcc: someone@example.test", 1);
        String room = roomIds(o.token(), p).getFirst();
        renameRoom(o.token(), room, "Room\n1");
        importEvent(calendarFor(room), "crlf-1", "2032-08-01", "2032-08-03", "Guest\r\nX-Injected: 1");
        EmailMessage m = mailbox.await(o.email(), x -> x.text().contains("Guest"), WAIT);
        assertNotNull(m);
        assertFalse(m.subject().contains("\r") || m.subject().contains("\n"), "subject: " + m.subject().replace("\r", "\\r").replace("\n", "\\n"));
    }

    @Test
    void linksUseTheConfiguredPublicUrlsAndTheUnsubscribeLinkWorks() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        importEvent(calendarFor(room), "link-1", "2032-09-01", "2032-09-03", "Link Guest");
        EmailMessage m = mailbox.await(o.email(), x -> x.text().contains("Link Guest"), WAIT);
        assertNotNull(m);

        String prefix = API_URL + "/api/notifications/unsubscribe?token=";
        assertTrue(m.html().contains("href=\"" + prefix), m.html());
        assertTrue(m.text().contains("Unsubscribe: " + prefix), m.text());
        assertTrue(m.headers().get("List-Unsubscribe").startsWith("<" + prefix), m.headers().toString());
        assertEquals("List-Unsubscribe=One-Click", m.headers().get("List-Unsubscribe-Post"));
        for (String part : List.of(m.html(), m.text(), m.headers().toString())) {
            assertFalse(part.contains("localhost") || part.contains("127.0.0.1"), part);
        }

        Matcher t = Pattern.compile("token=([A-Za-z0-9_\\-.]+)").matcher(m.text());
        assertTrue(t.find());
        mvc.perform(get("/api/notifications/unsubscribe").param("token", t.group(1))).andExpect(status().isOk());
        mvc.perform(post("/api/notifications/unsubscribe").param("token", t.group(1))).andExpect(status().isOk());
        assertEquals(Boolean.FALSE, (Boolean) JsonPath.read(getJson("/api/notifications/settings", o.token()), "$.enabled"));
    }

    @Test
    void accountEmailLinksUseTheConfiguredFrontendUrl() throws Exception {
        TestOwner o = newOwner();
        // registering again with a verified address sends the "already registered" notice
        send(post("/api/auth/register"), null, "{\"contactPhone\":\"1\",\"email\":\"" + o.email() + "\",\"password\":\"Another-pw-123\","
                + "\"fullName\":\"Again\"," + ACCEPT_TERMS + "}").andExpect(status().isAccepted());
        EmailMessage m = mailbox.await(o.email(), x -> x.subject().equals("You already have a RoomTrack account"), WAIT);
        assertNotNull(m);
        assertTrue(m.html().contains("href=\"" + FRONTEND_URL + "/login\""), m.html());
        assertTrue(m.html().contains("href=\"" + FRONTEND_URL + "/forgot-password\""), m.html());
        assertFalse(m.html().contains("localhost") || m.text().contains("localhost"));
    }

    private static UnsubscribeLinks links(String baseUrl) throws Exception {
        Constructor<UnsubscribeLinks> c = UnsubscribeLinks.class.getDeclaredConstructor(String.class, String.class);
        c.setAccessible(true);
        return c.newInstance("test-only-secret-test-only-secret-test-only-1234", baseUrl);
    }

    /** BIZ-04 (fixed): before, PUBLIC_API_URL "" (the compose default) gave relative links; now it is refused. */
    @Test
    void anEmptyPublicApiUrlIsRefusedAndATrailingSlashIsHandled() throws Exception {
        Exception e = assertThrows(Exception.class, () -> links(""));
        assertTrue(String.valueOf(e.getCause() != null ? e.getCause().getMessage() : e.getMessage()).contains("PUBLIC_API_URL"));
        assertEquals(API_URL + "/api/notifications/unsubscribe?token=", links(API_URL + "/").url(UUID.randomUUID())
                .substring(0, (API_URL + "/api/notifications/unsubscribe?token=").length()));
    }

    // Finding BIZ-04, FIXED (UnsubscribeLinks + config.PublicApiUrlCheck): regression test.
    @Test
    void unsubscribeLinksAreAlwaysAbsoluteHttps() throws Exception {
        String url;
        try {
            url = links("").url(UUID.randomUUID());
        } catch (Exception refusedAtStartup) {
            return; // refusing to start without a usable base URL is also a fix
        }
        assertTrue(url.startsWith("https://"), url);
    }

    /** Documents current behaviour behind BIZ-05: long property + room names still send the email... */
    @Test
    void aLongSubjectIsStillSent() throws Exception {
        TestOwner o = newOwner();
        String p = createPropertyNamed(o.token(), "P".repeat(250), 1);
        String room = roomIds(o.token(), p).getFirst();
        renameRoom(o.token(), room, "R".repeat(250));
        importEvent(calendarFor(room), "long-1", "2032-10-01", "2032-10-03", "Long Guest");
        EmailMessage m = mailbox.await(o.email(), x -> x.text().contains("Long Guest"), WAIT);
        assertNotNull(m);
        assertTrue(m.subject().length() > 255, "subject length " + m.subject().length());
    }

    // Finding BIZ-05: ...but the email_log row (subject VARCHAR(255)) cannot be written, so the send leaves no trace.
    @Tag("open-finding")
    @Test
    void aLongSubjectIsStillLogged() throws Exception {
        TestOwner o = newOwner();
        String p = createPropertyNamed(o.token(), "P".repeat(250), 1);
        String room = roomIds(o.token(), p).getFirst();
        renameRoom(o.token(), room, "R".repeat(250));
        importEvent(calendarFor(room), "long-2", "2032-11-01", "2032-11-03", "Long Guest Two");
        assertNotNull(mailbox.await(o.email(), x -> x.text().contains("Long Guest Two"), WAIT));
        Thread.sleep(500);
        assertEquals(1, logRows(ownerIdOfUnit(room), "EXTERNAL_RESERVATION_IMPORTED"));
    }
}
