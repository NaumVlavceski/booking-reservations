package com.naumvlavceski.bookingbackend.testsupport;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Refuses to run ANY test when a database URL that the tests could pick up points somewhere other than a local,
 * throwaway test database. Registered for every test class through
 * {@code META-INF/services/org.junit.jupiter.api.extension.Extension} and {@code junit-platform.properties}.
 *
 * <p>Checked: TEST_DB_URL (application-test.yml) and SPRING_DATASOURCE_URL / spring.datasource.url, as environment
 * variables and system properties, because either would win over application-test.yml. Allowed: the Testcontainers
 * {@code jdbc:tc:} URL (the default), or a jdbc:postgresql URL on localhost / 127.0.0.1 / ::1 / host.docker.internal
 * whose database name contains "test".
 */
public class LocalDatabaseOnlyGuard implements BeforeAllCallback {

    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal");
    private static final List<String> KEYS = List.of("TEST_DB_URL", "SPRING_DATASOURCE_URL", "spring.datasource.url");

    private static volatile boolean checked;

    @Override
    public void beforeAll(ExtensionContext context) {
        if (checked) return;
        for (String key : KEYS) {
            check(key, System.getenv(key));
            check(key, System.getProperty(key));
        }
        checked = true;
    }

    static void check(String key, String url) {
        if (url == null || url.isBlank()) return;
        if (!isLocalTestDatabase(url)) {
            // The value itself is not printed: it may carry a password
            throw new IllegalStateException("Tests refuse to run: " + key + " does not point at a local test database "
                    + "(allowed: jdbc:tc:..., or jdbc:postgresql on localhost / 127.0.0.1 / ::1 / host.docker.internal "
                    + "with \"test\" in the database name)");
        }
    }

    static boolean isLocalTestDatabase(String url) {
        String u = url.trim();
        if (u.startsWith("jdbc:tc:")) return true;
        if (!u.startsWith("jdbc:postgresql://")) return false;
        try {
            URI uri = URI.create(u.substring("jdbc:".length()));
            String host = uri.getHost();
            String path = uri.getPath();
            if (host == null || path == null) return false;
            if (!LOCAL_HOSTS.contains(host.toLowerCase(Locale.ROOT))) return false;
            return path.toLowerCase(Locale.ROOT).contains("test");
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
