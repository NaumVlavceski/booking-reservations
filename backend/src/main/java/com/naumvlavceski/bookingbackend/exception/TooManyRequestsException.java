package com.naumvlavceski.bookingbackend.exception;

public class TooManyRequestsException extends RuntimeException {
    public TooManyRequestsException() {
        super("Too many requests. Please wait a while and try again.");
    }
}
