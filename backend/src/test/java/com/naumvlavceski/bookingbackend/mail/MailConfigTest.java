package com.naumvlavceski.bookingbackend.mail;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.*;

class MailConfigTest {

    private static MockEnvironment env(String... profiles) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return env;
    }

    @Test
    void mailCannotBeSwitchedOffWithoutTheLocalOrTestProfile() {
        assertThrows(IllegalStateException.class, () -> new MailConfig(env(), false));
        assertThrows(IllegalStateException.class, () -> new MailConfig(env("prod"), false));
        assertDoesNotThrow(() -> new MailConfig(env(), true));
    }

    @Test
    void codesAreLoggedOnlyLocallyWithMailOff() {
        assertTrue(new MailConfig(env("local"), false).logsCodes());
        assertFalse(new MailConfig(env("local"), true).logsCodes());
        assertFalse(new MailConfig(env("test"), false).logsCodes());
        assertFalse(new MailConfig(env(), true).logsCodes());
    }
}
