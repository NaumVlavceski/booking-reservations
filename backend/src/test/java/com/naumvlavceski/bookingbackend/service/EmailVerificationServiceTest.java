package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.exception.VerificationException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.EmailVerification;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.EmailVerificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class EmailVerificationServiceTest {

    static final String SECRET = "unit-test-code-secret-unit-test-code-secret";
    static final Pattern CODE = Pattern.compile("code is: (\\d{6})");

    /** A clock the tests can move forward. */
    static class TestClock extends Clock {
        Instant now = Instant.parse("2026-01-01T10:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
        void advance(Duration d) { now = now.plus(d); }
    }

    AppUserRepository users = mock(AppUserRepository.class);
    EmailVerificationRepository codes = mock(EmailVerificationRepository.class);
    EmailService emailService = mock(EmailService.class);
    TestClock clock = new TestClock();
    EmailVerificationService service;

    AppUser user = new AppUser();
    /** The code row as the service stored it, standing in for the database. */
    EmailVerification stored;

    @BeforeEach
    void setUp() {
        service = newService(true);

        Owner owner = new Owner();
        owner.setId(UUID.randomUUID());
        user.setId(UUID.randomUUID());
        user.setOwner(owner);
        user.setEmail("owner@example.com");
        when(users.findFirstByEmailIgnoreCase("owner@example.com")).thenReturn(Optional.of(user));
        when(users.save(any(AppUser.class))).thenAnswer(i -> i.getArgument(0));

        when(codes.save(any(EmailVerification.class))).thenAnswer(i -> {
            stored = i.getArgument(0);
            return stored;
        });
        when(codes.findFirstByUserIdAndConsumedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenAnswer(i -> stored == null || stored.getConsumedAt() != null ? Optional.empty() : Optional.of(stored));
        when(codes.findFirstByUserIdOrderByCreatedAtDesc(user.getId()))
                .thenAnswer(i -> Optional.ofNullable(stored));
    }

    private EmailVerificationService newService(boolean logCodes) {
        var s = new EmailVerificationService(users, codes, emailService, clock, SECRET, logCodes, 15, 5, 60, 5);
        s.validateSecret();
        return s;
    }

    /** Issues a code and returns the digits that were emailed. */
    private String issueCode() {
        service.issueAndSend(user);
        ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService, atLeastOnce()).send(eq(user.getOwner().getId()), eq("VERIFY_EMAIL"), msg.capture());
        Matcher m = CODE.matcher(msg.getValue().text());
        assertTrue(m.find(), "email should contain the 6-digit code");
        return m.group(1);
    }

    private static String wrongCodeFor(String code) {
        return code.equals("000000") ? "111111" : "000000";
    }

    private VerificationException failure(String code) {
        return assertThrows(VerificationException.class, () -> service.verify("owner@example.com", code));
    }

    @Test
    void issuedEmailHasTheRightShapeAndStoresOnlyAHash() {
        String code = issueCode();
        ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService).send(any(), eq("VERIFY_EMAIL"), msg.capture());

        assertEquals("Your RoomTrack verification code", msg.getValue().subject());
        assertEquals("owner@example.com", msg.getValue().to());
        assertFalse(msg.getValue().subject().contains(code), "code must not be in the subject (it ends up in email_log)");
        assertTrue(msg.getValue().html().contains(code));
        assertTrue(msg.getValue().text().contains("15 minutes"));
        assertEquals(6, code.length());

        assertNotEquals(code, stored.getCodeHash());
        assertFalse(stored.getCodeHash().contains(code));
        assertEquals(clock.now.plus(Duration.ofMinutes(15)), stored.getExpiresAt());
        verify(codes).invalidateOpen(eq(user.getId()), any());
    }

    @Test
    void validCodeVerifiesTheUserAndConsumesTheCode() {
        String code = issueCode();

        AppUser result = service.verify("OWNER@example.com", code);

        assertNotNull(result.getEmailVerifiedAt());
        assertNotNull(stored.getConsumedAt());
        assertThrows(VerificationException.class, () -> service.verify("owner@example.com", code),
                "a used code can't be used twice");
    }

    @Test
    void wrongCodeIsCountedButTheAnswerIsTheSameAsForAnyOtherFailure() {
        String code = issueCode();

        VerificationException e = failure(wrongCodeFor(code));

        assertEquals(VerificationException.INVALID_CODE, e.getCode());
        assertEquals("That code is not correct or has expired. Check the code or request a new one.", e.getMessage());
        assertEquals(1, stored.getAttempts());
        assertNull(user.getEmailVerifiedAt());
    }

    @Test
    void expiredCodeIsRejectedEvenIfCorrect() {
        String code = issueCode();
        clock.advance(Duration.ofMinutes(15));

        assertEquals(VerificationException.INVALID_CODE, failure(code).getCode());
        assertNull(user.getEmailVerifiedAt());
    }

    @Test
    void afterFiveWrongAttemptsEvenTheRightCodeIsRefused() {
        String code = issueCode();
        String wrong = wrongCodeFor(code);

        for (int i = 0; i < 5; i++) assertEquals(VerificationException.INVALID_CODE, failure(wrong).getCode());
        assertEquals(5, stored.getAttempts());

        assertEquals(VerificationException.INVALID_CODE, failure(code).getCode());
        assertNull(user.getEmailVerifiedAt());
    }

    @Test
    void resendWithinTheCooldownSendsNothing() {
        issueCode();
        clock.advance(Duration.ofSeconds(30));

        service.resend("owner@example.com");

        verify(emailService, times(1)).send(any(), any(), any());
    }

    @Test
    void resendAfterTheCooldownSendsANewCodeAndTheOldOneStopsWorking() {
        issueCode();
        EmailVerification firstRow = stored;
        clock.advance(Duration.ofSeconds(61));

        service.resend("owner@example.com");

        verify(emailService, times(2)).send(any(), any(), any());
        verify(codes, times(2)).invalidateOpen(eq(user.getId()), any());
        assertNotSame(firstRow, stored, "a new code row replaced the old one");
    }

    @Test
    void resendStopsAtFiveCodesPerHour() {
        when(codes.countByUserIdAndCreatedAtAfter(eq(user.getId()), any())).thenReturn(5L);
        clock.advance(Duration.ofMinutes(5));

        service.resend("owner@example.com");

        verify(emailService, never()).send(any(), any(), any());
        verify(codes, never()).save(any());
    }

    @Test
    void anAlreadyVerifiedAccountGetsNoCodeAndCannotUseOne() {
        user.setEmailVerifiedAt(java.time.OffsetDateTime.now());

        service.resend("owner@example.com");
        verify(emailService, never()).send(any(), any(), any());

        assertEquals(VerificationException.INVALID_CODE, failure("123456").getCode());
    }

    @Test
    void unknownEmailGivesTheGenericAnswerAndSendsNothing() {
        when(users.findFirstByEmailIgnoreCase("ghost@example.com")).thenReturn(Optional.empty());

        assertDoesNotThrow(() -> service.resend("ghost@example.com"));
        verify(emailService, never()).send(any(), any(), any());

        VerificationException unknown = assertThrows(VerificationException.class,
                () -> service.verify("ghost@example.com", "123456"));
        String code = issueCode();
        VerificationException wrongForRealUser = failure(wrongCodeFor(code));

        // Same stable error code as a plain wrong guess, so it doesn't reveal the address isn't registered
        assertEquals(VerificationException.INVALID_CODE, unknown.getCode());
        assertEquals(wrongForRealUser.getCode(), unknown.getCode());
    }

    private static Logger serviceLogger() {
        return (Logger) LoggerFactory.getLogger(EmailVerificationService.class);
    }

    @Test
    void theCodeIsLoggedOnlyWhenMailIsDisabled() {
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        serviceLogger().addAppender(appender);
        try {
            newService(true).issueAndSend(user);
            assertEquals(1, appender.list.size());
            assertTrue(appender.list.get(0).getFormattedMessage().startsWith("[DEV ONLY]"));
        } finally {
            serviceLogger().detachAppender(appender);
        }
    }

    @Test
    void withMailEnabledNothingAboutTheCodeIsLogged() {
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        serviceLogger().addAppender(appender);
        try {
            String code = null;
            EmailVerificationService enabled = newService(false);
            enabled.issueAndSend(user);
            ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
            verify(emailService).send(any(), eq("VERIFY_EMAIL"), msg.capture());
            Matcher m = CODE.matcher(msg.getValue().text());
            assertTrue(m.find());
            code = m.group(1);
            failureWith(enabled, wrongCodeFor(code));
            for (ILoggingEvent e : appender.list) {
                assertFalse(e.getFormattedMessage().contains(code), "the code must never be logged");
                assertFalse(e.getFormattedMessage().contains("DEV ONLY"));
            }
        } finally {
            serviceLogger().detachAppender(appender);
        }
    }

    private void failureWith(EmailVerificationService s, String code) {
        assertThrows(VerificationException.class, () -> s.verify("owner@example.com", code));
    }

    @Test
    void aShortSecretIsRefusedAtStartup() {
        var weak = new EmailVerificationService(users, codes, emailService, clock, "too-short", false, 15, 5, 60, 5);
        assertThrows(IllegalStateException.class, weak::validateSecret);
    }
}
