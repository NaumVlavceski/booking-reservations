package com.naumvlavceski.bookingbackend.mail;

import java.util.Map;

/** replyTo: where the recipient's Reply goes (null: back to the sender). Used by the contact form. */
public record EmailMessage(
        String to,
        String subject,
        String html,
        String text,
        Map<String, String> headers,
        String replyTo
) {
    public EmailMessage(String to, String subject, String html, String text) {
        this(to, subject, html, text, Map.of(), null);
    }

    public EmailMessage(String to, String subject, String html, String text, Map<String, String> headers) {
        this(to, subject, html, text, headers, null);
    }
}
