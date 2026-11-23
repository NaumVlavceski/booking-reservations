package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.EmailLog;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A2: every logged send leaves an email_log row, never with a body, and a log failure never blocks the email. */
class EmailServiceLogTest {

    private static final EmailMessage MSG = new EmailMessage("owner@example.test", "Your code",
            "<p>Your code is 123456</p>", "Your code is 123456");

    @Test
    void aSentEmailIsLoggedWithoutItsBody() {
        EmailSender sender = mock(EmailSender.class);
        EmailLogRepository logs = mock(EmailLogRepository.class);
        when(sender.send(any())).thenReturn("re_123");
        UUID owner = UUID.randomUUID();

        new EmailService(sender, logs).send(owner, "VERIFY_EMAIL", MSG); // not a Spring proxy: runs synchronously

        ArgumentCaptor<EmailLog> row = ArgumentCaptor.forClass(EmailLog.class);
        verify(logs).save(row.capture());
        assertEquals(EmailLog.SENT, row.getValue().getStatus());
        assertEquals("re_123", row.getValue().getProviderId());
        assertEquals(owner, row.getValue().getOwnerId());
        assertEquals("VERIFY_EMAIL", row.getValue().getType());
        assertNull(row.getValue().getBody(), "automatic emails never store their content");
        assertNull(row.getValue().getSentByAdminId());
        assertFalse(String.valueOf(row.getValue()).contains("123456"), "the code is in no logged field");
    }

    @Test
    void aFailedEmailIsLoggedWithAShortSafeReason() {
        EmailSender sender = mock(EmailSender.class);
        EmailLogRepository logs = mock(EmailLogRepository.class);
        when(sender.send(any())).thenThrow(new IllegalStateException(
                "rejected https://example.test/reset?token=abcdefabcdefabcdefabcdefabcdef " + "x".repeat(500)));

        new EmailService(sender, logs).send(UUID.randomUUID(), "PASSWORD_RESET", MSG);

        ArgumentCaptor<EmailLog> row = ArgumentCaptor.forClass(EmailLog.class);
        verify(logs).save(row.capture());
        assertEquals(EmailLog.FAILED, row.getValue().getStatus());
        String error = row.getValue().getError();
        assertTrue(error.length() <= 300, "error truncated to 300 characters");
        assertFalse(error.contains("https://"), "no links");
        assertFalse(error.contains("abcdefabcdef"), "no tokens");
        assertNull(row.getValue().getBody());
    }

    @Test
    void aLoggingFailureDoesNotStopTheEmail() {
        EmailSender sender = mock(EmailSender.class);
        EmailLogRepository logs = mock(EmailLogRepository.class);
        when(sender.send(any())).thenReturn("re_1");
        when(logs.save(any())).thenThrow(new RuntimeException("database down"));

        new EmailService(sender, logs).send(UUID.randomUUID(), "TEST", MSG);

        verify(sender).send(MSG);
    }
}
