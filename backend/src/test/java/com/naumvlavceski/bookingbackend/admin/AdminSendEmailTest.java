package com.naumvlavceski.bookingbackend.admin;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailSender;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** C1/C3: Send email from the admin panel. Fake test sender values only. */
@TestPropertySource(properties = {
        "app.admin.mail-from=RoomTrack Support <support@example.test>",
        "app.admin.mail-reply-to=admin-inbox@example.test"})
class AdminSendEmailTest extends AdminTestBase {

    @MockitoBean EmailSender sender;

    @BeforeEach
    void sends() {
        when(sender.send(any())).thenReturn("re_" + UUID.randomUUID());
    }

    private static String json(String to, String subject, String message) {
        return "{\"to\":" + quote(to) + ",\"subject\":" + quote(subject) + ",\"message\":" + quote(message)
                + ",\"from\":\"attacker@evil.test\"}";
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    @Test
    void sendsFromTheConfiguredSenderLogsTheBodyAndAuditsIdsOnly() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        TestOwner owner = newOwner();
        clearInvocations(sender);

        admin(get("/api/admin/emails/config"), admin, session, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.from").value("RoomTrack Support <support@example.test>"));

        String message = "Hi Ana,\nyour calendar <b>stopped</b> syncing.\nCould you send the new link?";
        String res = body(admin(post("/api/admin/emails/send"), admin, session,
                json(owner.email(), "About your calendar sync", message)).andExpect(status().isOk()));

        ArgumentCaptor<EmailMessage> mail = ArgumentCaptor.forClass(EmailMessage.class);
        verify(sender, atLeastOnce()).send(mail.capture());
        EmailMessage sent = mail.getAllValues().stream().filter(m -> m.to().equals(owner.email())).findFirst().orElseThrow();
        assertEquals("RoomTrack Support <support@example.test>", sent.from(), "sender only from the environment");
        assertEquals("admin-inbox@example.test", sent.replyTo());
        assertTrue(sent.html().contains("&lt;b&gt;stopped&lt;/b&gt;"), "HTML-escaped");
        assertTrue(sent.html().contains("<br>"), "line breaks kept");
        assertFalse(sent.html().contains("<a "), "no links added");

        String logId = JsonPath.read(res, "$.emailLogId");
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM email_log WHERE id = ?::uuid", logId);
        assertEquals("ADMIN_MESSAGE", row.get("type"));
        assertEquals(message, row.get("body"));
        assertEquals(userId(admin), row.get("sent_by_admin_id"));
        assertEquals(jdbc.queryForObject("SELECT owner_id FROM app_user WHERE id = ?", UUID.class, userId(owner)),
                row.get("owner_id"), "linked to the owner whose email it went to");

        // The owner's Emails tab shows it as sent by the admin, and its text can be opened
        admin(get("/api/admin/owners/" + userId(owner) + "/emails"), admin, session, null)
                .andExpect(jsonPath("$.items[0].sentByAdmin").value(true))
                .andExpect(jsonPath("$.items[0].hasBody").value(true));
        admin(get("/api/admin/owners/" + userId(owner) + "/emails/" + logId), admin, session, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.body").value(message));

        Map<String, Object> audit = jdbc.queryForMap("SELECT target_user_id, details::text AS d FROM admin_audit_log "
                + "WHERE admin_user_id = ? AND action = 'EMAIL_SENT'", userId(admin));
        assertEquals(userId(owner), audit.get("target_user_id"));
        String d = String.valueOf(audit.get("d"));
        assertTrue(d.contains(logId));
        assertFalse(d.contains(owner.email()), "no recipient address in the audit");
        assertFalse(d.contains("calendar"), "no subject or body in the audit");
    }

    @Test
    void anyAddressCanBeUsedButOnlyOne() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        String res = body(admin(post("/api/admin/emails/send"), admin, session,
                json("someone@example.test", "Hello", "Text")).andExpect(status().isOk()));
        assertNull(JsonPath.read(res, "$.ownerId"), "not an owner: no link");
    }

    @Test
    void headerInjectionAndBadInputAreRefusedBeforeSending() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        clearInvocations(sender);
        List<String> bad = List.of(
                json("a@example.test\r\nBcc: victim@example.test", "Hi", "Text"),
                json("a@example.test\nBcc: victim@example.test", "Hi", "Text"),
                json("a@example.test, b@example.test", "Hi", "Text"),
                json("a@example.test;b@example.test", "Hi", "Text"),
                json("Name <a@example.test>", "Hi", "Text"),
                json("not-an-address", "Hi", "Text"),
                json("a@example.test", "Hi\r\nBcc: victim@example.test", "Text"),
                json("a@example.test", "Hi\nthere", "Text"),
                json("a@example.test", "", "Text"),
                json("a@example.test", "x".repeat(151), "Text"),
                json("a@example.test", "Hi", "   "),
                json("a@example.test", "Hi", "x".repeat(5001)));
        for (String b : bad) admin(post("/api/admin/emails/send"), admin, session, b).andExpect(status().isBadRequest());
        verify(sender, never()).send(any());

        admin(post("/api/admin/emails/send"), admin, session, json("a@example.test", "x".repeat(150), "y".repeat(5000)))
                .andExpect(status().isOk());
    }

    @Test
    void twentyPerHourPerAdminSession() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        for (int i = 0; i < 20; i++) {
            admin(post("/api/admin/emails/send"), admin, session, json("a@example.test", "Hi " + i, "Text"))
                    .andExpect(status().isOk());
        }
        admin(post("/api/admin/emails/send"), admin, session, json("a@example.test", "One more", "Text"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void aFailedSendIsReportedAndLoggedWithItsBody() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        when(sender.send(any())).thenThrow(new IllegalStateException("rejected"));
        admin(post("/api/admin/emails/send"), admin, session, json("fail@example.test", "Hi", "Keep this text"))
                .andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("ADMIN_MAIL_FAILED"));
        Map<String, Object> row = jdbc.queryForMap("SELECT status, body FROM email_log WHERE sent_by_admin_id = ? "
                + "ORDER BY created_at DESC LIMIT 1", userId(admin));
        assertEquals("FAILED", row.get("status"));
        assertEquals("Keep this text", row.get("body"));
    }
}
