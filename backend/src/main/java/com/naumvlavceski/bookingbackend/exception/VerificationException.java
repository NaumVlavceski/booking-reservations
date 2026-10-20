package com.naumvlavceski.bookingbackend.exception;

/** A failed email-code check. {@code code} is stable so the frontend can react to it; the message is safe to show. */
public class VerificationException extends RuntimeException {
    public static final String INVALID_CODE = "INVALID_CODE";
    public static final String CODE_EXPIRED = "CODE_EXPIRED";
    public static final String TOO_MANY_ATTEMPTS = "TOO_MANY_ATTEMPTS";
    public static final String RESET_TOKEN_INVALID = "RESET_TOKEN_INVALID";
    public static final String WRONG_PASSWORD = "WRONG_PASSWORD";

    private final String code;

    public VerificationException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
