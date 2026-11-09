package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.ContactRequest;
import com.naumvlavceski.bookingbackend.exception.ContactUnavailableException;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

/**
 * The contact form: one email to the owner (app.contact.to), with Reply-To set to the visitor so a normal Reply
 * answers them. Nothing is stored, and the visitor gets no email: their address is not verified, so sending to it
 * would let anyone use the form to mail a stranger from our domain.
 */
@Service
public class ContactService {
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'", Locale.ENGLISH);

    private final EmailService emailService;
    private final Clock clock;
    private final String to;

    public ContactService(EmailService emailService, Clock clock, @Value("${app.contact.to:}") String to) {
        this.emailService = emailService;
        this.clock = clock;
        this.to = to == null ? "" : to.trim();
    }

    /** Sends the message, or throws {@link ContactUnavailableException} when it could not be sent. */
    public void send(ContactRequest request) {
        if (to.isEmpty()) {
            throw new ContactUnavailableException(ContactUnavailableException.UNAVAILABLE,
                    "The contact form is not available right now.");
        }
        if (!emailService.sendNow(message(request))) {
            throw new ContactUnavailableException(ContactUnavailableException.FAILED,
                    "Your message could not be sent right now. Please try again later.");
        }
    }

    EmailMessage message(ContactRequest request) {
        String from = request.email().trim();
        String subject = oneLine(request.subject());
        String body = request.message().strip();
        String when = OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC).format(WHEN);

        String text = "From: " + from + "\n"
                + "Sent: " + when + "\n\n"
                + body + "\n\n"
                + "-- \nSent from the contact form on roomtrack.app. Reply to this email to answer " + from + ".";
        String html = "<p style=\"color:#555\">From: <strong>" + HtmlUtils.htmlEscape(from) + "</strong><br>"
                + "Sent: " + when + "</p>"
                + "<p style=\"white-space:pre-wrap\">" + HtmlUtils.htmlEscape(body) + "</p>"
                + "<p style=\"color:#888;font-size:12px\">Sent from the contact form on roomtrack.app. "
                + "Reply to this email to answer " + HtmlUtils.htmlEscape(from) + ".</p>";
        return new EmailMessage(to, "RoomTrack contact: " + subject, html, text, Map.of(), from);
    }

    /** Line breaks and other control characters can't go into a subject line. */
    private static String oneLine(String s) {
        return s.replaceAll("\\p{Cntrl}+", " ").replaceAll("\\s{2,}", " ").strip();
    }
}
