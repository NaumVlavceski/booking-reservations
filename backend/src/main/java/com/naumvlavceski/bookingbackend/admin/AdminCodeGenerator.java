package com.naumvlavceski.bookingbackend.admin;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** Makes the 6-digit admin step-up code. A bean of its own only so tests can know the code without it being logged. */
@Component
public class AdminCodeGenerator {
    private static final SecureRandom RANDOM = new SecureRandom();

    public String next() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }
}
