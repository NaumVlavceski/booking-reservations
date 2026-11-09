package com.naumvlavceski.bookingbackend.exception;

import lombok.Getter;

/**
 * 503 from the contact form: CONTACT_UNAVAILABLE when no recipient is set (app.contact.to), CONTACT_FAILED when the
 * email could not be delivered. Either way nothing was sent, so the visitor can try again later.
 */
@Getter
public class ContactUnavailableException extends RuntimeException {
    public static final String UNAVAILABLE = "CONTACT_UNAVAILABLE";
    public static final String FAILED = "CONTACT_FAILED";

    private final String code;

    public ContactUnavailableException(String code, String message) {
        super(message);
        this.code = code;
    }
}
