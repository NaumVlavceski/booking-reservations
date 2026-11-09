package com.naumvlavceski.bookingbackend.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Stand-in sender for local development and tests: nothing is sent and only the subject is logged, never the body.
 * It cannot exist outside the "local" and "test" profiles (MailConfig refuses to start without a real sender).
 */
@Slf4j
@Component
@Profile({MailConfig.LOCAL_PROFILE, MailConfig.TEST_PROFILE})
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingEmailSender implements EmailSender {
    @Override
    public String send(EmailMessage m) {
        log.info("[mail disabled] subject={}", m.subject());
        return "local-" + UUID.randomUUID();
    }
}
