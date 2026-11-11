package com.naumvlavceski.bookingbackend.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** "Contact support" (POST /api/me/support) through the real filter chain. Mail is the only mock. */
@SpringBootTest(properties = "app.contact.to=owner@example.test")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SupportIntegrationTest {
    private static final String PASSWORD = "Pw-" + UUID.randomUUID();
    private static final String ACCEPT_TERMS = "\"acceptedTerms\":true,\"termsVersion\":\"2026-10-30\",\"privacyVersion\":\"2026-10-30\"";

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository appUsers;
    @MockitoBean EmailService emailService;

    @BeforeEach
    void mailWorks() {
        when(emailService.sendNow(any())).thenReturn(true);
    }

    private ResultActions json(String path, String token, String body) throws Exception {
        var req = post(path).contentType(MediaType.APPLICATION_JSON).content(body)
                .with(r -> { r.setRemoteAddr(UUID.randomUUID().toString()); return r; });
        if (token != null) req.header("Authorization", "Bearer " + token);
        return mvc.perform(req);
    }

    /** A registered, verified owner; returns {email, token}. */
    private String[] owner() throws Exception {
        String email = "support_" + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
        json("/api/auth/register", null, "{\"contactPhone\":\"+389 70 111 222\",\"email\":\"" + email
                + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Ana Owner\"," + ACCEPT_TERMS + "}")
                .andExpect(status().isAccepted());
        AppUser user = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        user.setEmailVerifiedAt(OffsetDateTime.now());
        appUsers.save(user);
        String token = JsonPath.read(json("/api/auth/login", null,
                "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.token");
        return new String[]{email, token};
    }

    private EmailMessage sent() {
        ArgumentCaptor<EmailMessage> mail = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService).sendNow(mail.capture());
        return mail.getValue();
    }

    @Test
    void sendsToTheInboxWithReplyToTheAccountsOwnEmail() throws Exception {
        String[] o = owner();
        // An email in the request is ignored: the reply address always comes from the signed-in account
        json("/api/me/support", o[1], "{\"message\":\"Sync <b>stopped</b>\\nSince Monday\",\"email\":\"someone@else.test\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(containsString(o[0])));

        EmailMessage m = sent();
        assertEquals("owner@example.test", m.to());
        assertEquals(o[0], m.replyTo());
        assertEquals("RoomTrack support: Ana Owner", m.subject());
        assertTrue(m.text().startsWith("From: Ana Owner (" + o[0] + ")"));
        assertTrue(m.text().contains("Sync <b>stopped</b>\nSince Monday"));
        assertTrue(m.html().contains("Sync &lt;b&gt;stopped&lt;/b&gt;"), "the message is escaped in the HTML");
    }

    @Test
    void needsSignInAndAMessage() throws Exception {
        json("/api/me/support", null, "{\"message\":\"Hello\"}").andExpect(status().isUnauthorized());
        String token = owner()[1];
        json("/api/me/support", token, "{\"message\":\"  \"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.message").exists());
        json("/api/me/support", token, "{\"message\":\"" + "x".repeat(5001) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.message").exists());
        verify(emailService, never()).sendNow(any());
    }

    @Test
    void fivePerHourPerAccount() throws Exception {
        String token = owner()[1];
        for (int i = 0; i < 5; i++) json("/api/me/support", token, "{\"message\":\"Hi " + i + "\"}").andExpect(status().isOk());
        json("/api/me/support", token, "{\"message\":\"Hi again\"}")
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        verify(emailService, times(5)).sendNow(any());
    }
}
