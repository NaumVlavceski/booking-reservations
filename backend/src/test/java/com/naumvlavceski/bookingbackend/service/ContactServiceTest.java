package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.ContactRequest;
import com.naumvlavceski.bookingbackend.exception.ContactUnavailableException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ContactServiceTest {
    private final EmailService emailService = mock(EmailService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-09T14:05:00Z"), ZoneOffset.UTC);
    private final ContactRequest request = new ContactRequest("guest@example.com", "Hello", "A question", null);

    @Test
    void withoutARecipientTheFormIsUnavailableAndNothingIsSent() {
        for (String to : new String[]{"", "   ", null}) {
            ContactService service = new ContactService(emailService, clock, to);
            ContactUnavailableException e = assertThrows(ContactUnavailableException.class, () -> service.send(request));
            assertEquals(ContactUnavailableException.UNAVAILABLE, e.getCode());
        }
        verify(emailService, never()).sendNow(any());
    }

    @Test
    void theEmailSaysWhoWroteAndWhen() {
        EmailMessage m = new ContactService(emailService, clock, " owner@example.test ").message(request);
        assertEquals("owner@example.test", m.to());
        assertEquals("guest@example.com", m.replyTo());
        assertTrue(m.text().startsWith("From: guest@example.com\nSent: 9 Nov 2026, 14:05 UTC\n\nA question"));
    }

    @Test
    void supportMessagesNameTheAccountAndReplyToIt() {
        ContactService service = new ContactService(emailService, clock, "owner@example.test");
        EmailMessage m = service.supportMessage(" ana@example.com ", "Ana\nOwner", "  Help please  ");
        assertEquals("owner@example.test", m.to());
        assertEquals("ana@example.com", m.replyTo());
        assertEquals("RoomTrack support: Ana Owner", m.subject(), "a line break can't split the subject");
        assertTrue(m.text().startsWith("From: Ana Owner (ana@example.com)\nSent: 9 Nov 2026, 14:05 UTC\n\nHelp please\n"));

        EmailMessage noName = service.supportMessage("ana@example.com", "  ", "Hi");
        assertEquals("RoomTrack support: ana@example.com", noName.subject());
        assertTrue(noName.text().startsWith("From: ana@example.com\n"));
    }
}
