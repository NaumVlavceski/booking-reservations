package com.naumvlavceski.bookingbackend.mail;

import java.util.Map;

public record EmailMessage(
        String to,
        String subject,
        String html,
        String text,
        Map<String, String> headers
) {
    public EmailMessage(String to, String subject, String html, String text) {
        this(to, subject, html, text, Map.of());
    }
}
