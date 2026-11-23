package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.mail.MailConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * Same style as PublicApiUrlCheck: with APP_ADMIN_ENABLED=true the app refuses to start unless email is really sent
 * (MAIL_ENABLED=true and RESEND_API_KEY set), because the admin panel can only be opened with an emailed code and
 * there is no bypass. The "local" and "test" profiles are exempt, like PublicApiUrlCheck (see {@link #check}).
 */
@Component
@EnableConfigurationProperties(AdminProperties.class)
public class AdminStartupCheck {

    public AdminStartupCheck(Environment environment, AdminProperties admin,
                             @Value("${app.mail.enabled:false}") boolean mailEnabled,
                             @Value("${app.mail.resend-api-key:}") String resendKey) {
        check(admin.enabled(),
                environment.acceptsProfiles(Profiles.of(MailConfig.LOCAL_PROFILE, MailConfig.TEST_PROFILE)),
                mailEnabled, resendKey);
    }

    /**
     * {@code devOrTest}: the "local" or "test" profile. There, mail may be off (MailConfig allows it only there) and
     * the code is printed to the console instead (local) or captured by the tests; everywhere else email is required.
     */
    static void check(boolean adminEnabled, boolean devOrTest, boolean mailEnabled, String resendKey) {
        if (!adminEnabled || devOrTest) return;
        if (!mailEnabled || resendKey == null || resendKey.isBlank()) {
            throw new IllegalStateException("APP_ADMIN_ENABLED=true needs working email (MAIL_ENABLED=true and "
                    + "RESEND_API_KEY): the admin panel opens only with an emailed code");
        }
    }
}
