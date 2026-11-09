package com.naumvlavceski.bookingbackend.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class MailConfig {
    public static final String LOCAL_PROFILE = "local";
    public static final String TEST_PROFILE = "test";

    /**
     * Mail can only be switched off on a developer machine or in tests. Anywhere else (production has no profile)
     * the app refuses to start, so verification and reset codes can never end up in the server logs instead of an inbox.
     */
    MailConfig(Environment env, @Value("${app.mail.enabled:false}") boolean mailEnabled) {
        if (!mailEnabled && !env.acceptsProfiles(Profiles.of(LOCAL_PROFILE, TEST_PROFILE))) {
            throw new IllegalStateException("MAIL_ENABLED must be true outside the 'local' and 'test' profiles");
        }
        this.logsCodes = !mailEnabled && env.acceptsProfiles(Profiles.of(LOCAL_PROFILE));
    }

    private final boolean logsCodes;

    /**
     * True only where a developer reads emailed codes from the console: mail off and the "local" profile active.
     * Injected into the code services as {@code @Value("#{@mailConfig.logsCodes()}")}.
     */
    public boolean logsCodes() {
        return logsCodes;
    }

    @Bean("mailExecutor")
    Executor mailExecutor() {
        var ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(2);
        ex.setMaxPoolSize(4);
        ex.setQueueCapacity(200);
        ex.setThreadNamePrefix("mail-");
        ex.initialize();
        return ex;
    }
}
