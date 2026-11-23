package com.naumvlavceski.bookingbackend.mail;

import java.util.Map;

/**
 * replyTo: where the recipient's Reply goes (null: back to the sender). Used by the contact form and admin messages.
 * from: the sender for this one message (null: app.mail.from). Only the admin's Send email sets it, always from the
 * server's own configuration (APP_ADMIN_MAIL_FROM), never from a request.
 */
public record EmailMessage(
        String to,
        String subject,
        String html,
        String text,
        Map<String, String> headers,
        String replyTo,
        String from
) {
    public EmailMessage(String to, String subject, String html, String text) {
        this(to, subject, html, text, Map.of(), null, null);
    }

    public EmailMessage(String to, String subject, String html, String text, Map<String, String> headers) {
        this(to, subject, html, text, headers, null, null);
    }

    public EmailMessage(String to, String subject, String html, String text, Map<String, String> headers, String replyTo) {
        this(to, subject, html, text, headers, replyTo, null);
    }
}
