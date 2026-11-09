package com.naumvlavceski.bookingbackend.api;

import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
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

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The contact form through the real filter chain, with no token. Mail is the only mock. */
@SpringBootTest(properties = "app.contact.to=owner@example.test")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContactIntegrationTest {
    @Autowired MockMvc mvc;
    @MockitoBean EmailService emailService;

    @BeforeEach
    void mailWorks() {
        when(emailService.sendNow(any())).thenReturn(true);
    }

    /** Each call comes from its own address unless one is given, so the per-IP limit only bites where tested. */
    private ResultActions contact(String body, String ip) throws Exception {
        String clientIp = ip != null ? ip : UUID.randomUUID().toString();
        return mvc.perform(post("/api/contact").contentType(MediaType.APPLICATION_JSON).content(body)
                .with(r -> { r.setRemoteAddr(clientIp); return r; }));
    }

    private static String body(String email, String subject, String message, String website) {
        return "{\"email\":\"" + email + "\",\"subject\":\"" + subject + "\",\"message\":\"" + message + "\""
                + (website == null ? "" : ",\"website\":\"" + website + "\"") + "}";
    }

    private EmailMessage sent() {
        ArgumentCaptor<EmailMessage> mail = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService).sendNow(mail.capture());
        return mail.getValue();
    }

    @Test
    void sendsToTheOwnerWithReplyToTheVisitor() throws Exception {
        contact(body("Guest@Example.com", "Question\\nabout sync", "Hi <b>there</b>\\nSecond line", null), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("sent")));

        EmailMessage m = sent();
        assertEquals("owner@example.test", m.to());
        assertEquals("Guest@Example.com", m.replyTo());
        // A line break can't split the subject into a header of its own
        assertEquals("RoomTrack contact: Question about sync", m.subject());
        assertTrue(m.text().contains("Hi <b>there</b>\nSecond line"));
        assertTrue(m.html().contains("Hi &lt;b&gt;there&lt;/b&gt;"), "the visitor's words are escaped in the HTML");
        assertFalse(m.html().contains("<b>there"));
    }

    @Test
    void spamTrapFilledInLooksSentButSendsNothing() throws Exception {
        contact(body("bot@example.com", "Buy now", "Cheap stuff", "https://spam.example"), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("sent")));
        verify(emailService, never()).sendNow(any());
    }

    @Test
    void refusesAnythingButOnePlainAddress() throws Exception {
        for (String email : new String[]{"not-an-email", "a@example.com, b@example.com", "Name <a@example.com>", ""}) {
            contact(body(email, "Hi", "Hello", null), null)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors.email").exists());
        }
        verify(emailService, never()).sendNow(any());
    }

    @Test
    void refusesEmptyOrOversizedFields() throws Exception {
        contact(body("guest@example.com", " ", "Hello", null), null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.subject").exists());
        contact(body("guest@example.com", "Hi", "", null), null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.message").exists());
        contact(body("guest@example.com", "Hi", "x".repeat(5001), null), null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.message").exists());
        verify(emailService, never()).sendNow(any());
    }

    @Test
    void fivePerHourFromOneAddress() throws Exception {
        String ip = "203.0.113." + (int) (Math.random() * 200 + 1);
        for (int i = 0; i < 5; i++) {
            contact(body("guest@example.com", "Hi " + i, "Hello", null), ip).andExpect(status().isOk());
        }
        contact(body("guest@example.com", "Hi again", "Hello", null), ip)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists("Retry-After"));
        verify(emailService, times(5)).sendNow(any());
    }

    @Test
    void saysSoWhenTheEmailCouldNotBeSent() throws Exception {
        when(emailService.sendNow(any())).thenReturn(false);
        contact(body("guest@example.com", "Hi", "Hello", null), null)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("CONTACT_FAILED"));
    }
}
