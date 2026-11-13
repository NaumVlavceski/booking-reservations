package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.config.security.IcalUrlGuard;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.net.URI;

/**
 * Audit finding ICAL-03: the SSRF check ran only when a link was connected. A stored URL (an old row, a manual fix)
 * or a host whose DNS later points somewhere private was fetched unchecked. Every sync now runs
 * {@link IcalUrlGuard#validate} right before the download. Redirects are never followed (see IcalFetcher), so there is
 * no second address to check.
 */
@Component
public class IcalFetchGuard {

    private final boolean testProfile;
    private volatile boolean allowLoopbackStubs;

    public IcalFetchGuard(Environment environment) {
        this.testProfile = environment.acceptsProfiles(Profiles.of("test"));
    }

    /**
     * For the integration tests' stub feed server on 127.0.0.1 only. Has no effect unless the "test" profile is
     * active, and even then only plain loopback addresses are let through.
     */
    public void allowLoopbackStubsInTests(boolean allow) {
        this.allowLoopbackStubs = allow;
    }

    public void check(String url) {
        if (testProfile && allowLoopbackStubs && isLoopback(url)) return;
        IcalUrlGuard.validate(url);
    }

    private static boolean isLoopback(String url) {
        try {
            String host = URI.create(url).getHost();
            return "127.0.0.1".equals(host) || "localhost".equals(host);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
