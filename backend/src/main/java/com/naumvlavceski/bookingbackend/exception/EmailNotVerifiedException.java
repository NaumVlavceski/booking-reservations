package com.naumvlavceski.bookingbackend.exception;

public class EmailNotVerifiedException extends RuntimeException {
    private final String email;

    public EmailNotVerifiedException(String email) {
        super("Please verify your email address to log in.");
        this.email = email;
    }

    public String getEmail() {
        return email;
    }
}
