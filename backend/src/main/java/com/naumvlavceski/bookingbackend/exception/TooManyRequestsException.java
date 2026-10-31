package com.naumvlavceski.bookingbackend.exception;

/** 429. Carries how long to wait, which the handler sends as Retry-After and puts into a friendly message. */
public class TooManyRequestsException extends RuntimeException {
    private final long retryAfterSeconds;

    public TooManyRequestsException(long retryAfterSeconds) {
        super(message(retryAfterSeconds));
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    private static String message(long seconds) {
        if (seconds <= 60) return "Too many attempts. Please wait a minute and try again.";
        long minutes = (seconds + 59) / 60;
        return "Too many attempts. Please wait about " + minutes + " minutes and try again.";
    }
}
