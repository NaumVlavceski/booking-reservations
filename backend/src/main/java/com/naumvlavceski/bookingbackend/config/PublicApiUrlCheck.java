package com.naumvlavceski.bookingbackend.config;

import com.naumvlavceski.bookingbackend.mail.MailConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/**
 * Audit findings SEC-04 / BIZ-04: links in emails (unsubscribe) are built from PUBLIC_API_URL. Outside the "local"
 * and "test" profiles (production runs without a profile) the app refuses to start unless it is an https address
 * of a real host, so a missing "https://" or a leftover localhost value can't ship broken links to owners.
 */
@Component
public class PublicApiUrlCheck {

    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0");

    public PublicApiUrlCheck(Environment environment, @Value("${app.public-api-url:}") String publicApiUrl) {
        boolean devOrTest = environment.acceptsProfiles(Profiles.of(MailConfig.LOCAL_PROFILE, MailConfig.TEST_PROFILE));
        check(devOrTest, publicApiUrl);
    }

    static void check(boolean devOrTest, String url) {
        if (devOrTest) return;
        String problem = problemWith(url);
        if (problem != null) {
            throw new IllegalStateException("PUBLIC_API_URL " + problem
                    + ". Set it to the API's public https address, e.g. https://api.roomtrack.app");
        }
    }

    private static String problemWith(String url) {
        if (url == null || url.isBlank()) return "is empty";
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (IllegalArgumentException e) {
            return "is not a valid address";
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) return "must start with https://";
        if (uri.getHost() == null) return "has no host name";
        if (LOCAL_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT)) || uri.getHost().endsWith(".localhost")) {
            return "points to this machine (localhost)";
        }
        return null;
    }
}
