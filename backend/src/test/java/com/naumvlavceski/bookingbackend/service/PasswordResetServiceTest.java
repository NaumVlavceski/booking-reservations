package com.naumvlavceski.bookingbackend.service;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimiter;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.PasswordResetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** What only a unit test can see: the code never reaches the logs once real mail is on. */
class PasswordResetServiceTest {
    private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

    AppUserRepository users = mock(AppUserRepository.class);
    PasswordResetRepository resets = mock(PasswordResetRepository.class);
    EmailService emailService = mock(EmailService.class);
    RateLimiter rateLimiter = mock(RateLimiter.class);
    AppUser user = new AppUser();

    @BeforeEach
    void setUp() {
        Owner owner = new Owner();
        owner.setId(UUID.randomUUID());
        user.setId(UUID.randomUUID());
        user.setOwner(owner);
        user.setEmail("owner@example.com");
        user.setEmailVerifiedAt(OffsetDateTime.now());
        when(users.findFirstByEmailIgnoreCase("owner@example.com")).thenReturn(Optional.of(user));
        when(resets.findFirstByUserIdOrderByCreatedAtDesc(any())).thenReturn(Optional.empty());
        when(rateLimiter.tryAcquire(anyString(), anyInt(), any())).thenReturn(true);
    }

    private PasswordResetService newService(boolean logCodes) {
        return new PasswordResetService(users, resets, emailService, mock(PasswordEncoder.class), rateLimiter,
                Clock.systemUTC(), "unit-test-code-secret-unit-test-code-secret", logCodes, 10, 10, 5, 60, 5);
    }

    private static Logger serviceLogger() {
        return (Logger) LoggerFactory.getLogger(PasswordResetService.class);
    }

    @Test
    void withMailEnabledTheCodeIsNeverLogged() {
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        serviceLogger().addAppender(appender);
        try {
            newService(false).requestReset("owner@example.com");
            ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
            verify(emailService).send(any(), eq("PASSWORD_RESET"), msg.capture());
            Matcher m = CODE.matcher(msg.getValue().text());
            assertTrue(m.find());
            assertTrue(msg.getValue().text().contains("expires in 10 minutes"));
            assertTrue(msg.getValue().text().contains("If you did not request this, you can ignore this email."));
            for (ILoggingEvent e : appender.list) {
                assertFalse(e.getFormattedMessage().contains(m.group(1)), "the code must never be logged");
                assertFalse(e.getFormattedMessage().contains("DEV ONLY"));
            }
        } finally {
            serviceLogger().detachAppender(appender);
        }
    }

    @Test
    void withMailDisabledOnlyTheMarkedDevLineIsLogged() {
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        serviceLogger().addAppender(appender);
        try {
            newService(true).requestReset("owner@example.com");
            assertEquals(1, appender.list.size());
            assertTrue(appender.list.get(0).getFormattedMessage().startsWith("[DEV ONLY]"));
        } finally {
            serviceLogger().detachAppender(appender);
        }
    }
}
