package com.naumvlavceski.bookingbackend.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Slf4j
@Component
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingEmailSender implements EmailSender {
    @Override
    public String send(EmailMessage m) {
        log.info("[mail disabled] to={} subject={}", m.to(), m.subject());
        return "local-" + UUID.randomUUID();
    }
}
