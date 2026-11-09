package com.naumvlavceski.bookingbackend.exception;

/** 403 DEMO_RESTRICTED: an action that is turned off for the public demo account (see DemoGuard). */
public class DemoRestrictedException extends RuntimeException {
    public DemoRestrictedException(String message) {
        super(message);
    }
}
