package com.naumvlavceski.bookingbackend.ical;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.*;

/** ICAL-03: the guard that runs before every feed download. */
class IcalFetchGuardTest {

    private static IcalFetchGuard guard(String... profiles) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return new IcalFetchGuard(env);
    }

    @Test
    void privateAndPlainHttpUrlsAreRefusedBeforeDownloading() {
        IcalFetchGuard g = guard("prod");
        for (String url : new String[]{"http://127.0.0.1:8080/x.ics", "https://127.0.0.1/x.ics", "https://10.0.0.1/x.ics",
                "https://169.254.169.254/latest", "https://[::1]/x.ics", "file:///etc/passwd"}) {
            assertThrows(IcalFetchException.class, () -> g.check(url), url);
        }
    }

    @Test
    void theTestStubAllowanceDoesNothingOutsideTheTestProfile() {
        IcalFetchGuard g = guard("prod");
        g.allowLoopbackStubsInTests(true);
        assertThrows(IcalFetchException.class, () -> g.check("http://127.0.0.1:8080/x.ics"));
    }

    @Test
    void inTheTestProfileOnlyLoopbackStubsAreLetThroughAndOnlyWhenAsked() {
        IcalFetchGuard g = guard("test");
        assertThrows(IcalFetchException.class, () -> g.check("http://127.0.0.1:8080/x.ics"));
        g.allowLoopbackStubsInTests(true);
        assertDoesNotThrow(() -> g.check("http://127.0.0.1:8080/x.ics"));
        assertThrows(IcalFetchException.class, () -> g.check("https://10.0.0.1/x.ics"));
    }
}
