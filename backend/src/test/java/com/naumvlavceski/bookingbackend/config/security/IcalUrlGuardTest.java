package com.naumvlavceski.bookingbackend.config.security;

import com.naumvlavceski.bookingbackend.ical.IcalFetchException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

/** The SSRF guard: nothing that points at this machine or a private network may be fetched. No network needed. */
class IcalUrlGuardTest {

    @Test
    void onlyHttpsIsAccepted() {
        assertThrows(IcalFetchException.class, () -> IcalUrlGuard.validate("http://ical.booking.com/v1/export?t=a"));
        assertThrows(IcalFetchException.class, () -> IcalUrlGuard.validate("ftp://ical.booking.com/a.ics"));
        assertThrows(IcalFetchException.class, () -> IcalUrlGuard.validate("not a url"));
    }

    @Test
    void privateAndLocalAddressesAreRefused() {
        for (String bad : new String[]{"https://localhost/a.ics", "https://127.0.0.1/a.ics", "https://10.0.0.1/a.ics",
                "https://192.168.1.10/a.ics", "https://169.254.169.254/latest", "https://[::1]/a.ics", "https://0.0.0.0/a.ics"}) {
            assertThrows(IcalFetchException.class, () -> IcalUrlGuard.validate(bad), bad);
        }
    }
}
