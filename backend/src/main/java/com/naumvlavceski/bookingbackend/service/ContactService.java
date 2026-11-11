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
 * The contact form, and "Contact support" inside the app: one email to the owner (app.contact.to), with Reply-To
 * set to the visitor (or the signed-in account) so a normal Reply answers them. Nothing is stored, and the visitor gets no email: their address is not verified, so sending to it
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
        deliver(message(request));
    }

    /**
     * "Contact support" from a signed-in account: same inbox as the contact form, Reply-To the account's own email.
     * Throws {@link ContactUnavailableException} like {@link #send}.
     */
    public void sendSupport(String accountEmail, String fullName, String message) {
        deliver(supportMessage(accountEmail, fullName, message));
    }

    private void deliver(EmailMessage message) {
        if (to.isEmpty()) {
            throw new ContactUnavailableException(ContactUnavailableException.UNAVAILABLE,
                    "The contact form is not available right now.");
        }
        if (!emailService.sendNow(message)) {
            throw new ContactUnavailableException(ContactUnavailableException.FAILED,
                    "Your message could not be sent right now. Please try again later.");
        }
    }

    EmailMessage message(ContactRequest request) {
        String from = request.email().trim();
        return email(from, from, "RoomTrack contact: " + oneLine(request.subject()), request.message(),
                "Sent from the contact form on roomtrack.app.");
    }

    EmailMessage supportMessage(String accountEmail, String fullName, String message) {
        String from = accountEmail.trim();
        String name = fullName == null ? "" : oneLine(fullName);
        String who = name.isEmpty() ? from : name + " (" + from + ")";
        return email(from, who, "RoomTrack support: " + (name.isEmpty() ? from : name), message,
                "Sent from Contact support in the RoomTrack app, by a signed-in account.");
    }

    /** One email to the inbox: who wrote and when, their words, and a footer saying where it came from. */
    private EmailMessage email(String replyTo, String who, String subject, String message, String origin) {
        String body = message.strip();
        String when = OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC).format(WHEN);

        String text = "From: " + who + "\n"
                + "Sent: " + when + "\n\n"
                + body + "\n\n"
                + "-- \n" + origin + " Reply to this email to answer " + replyTo + ".";
        String html = "<p style=\"color:#555\">From: <strong>" + HtmlUtils.htmlEscape(who) + "</strong><br>"
                + "Sent: " + when + "</p>"
                + "<p style=\"white-space:pre-wrap\">" + HtmlUtils.htmlEscape(body) + "</p>"
                + "<p style=\"color:#888;font-size:12px\">" + origin + " "
                + "Reply to this email to answer " + HtmlUtils.htmlEscape(replyTo) + ".</p>";
        return new EmailMessage(to, subject, html, text, Map.of(), replyTo);
    }

    /** Line breaks and other control characters can't go into a subject line. */
    private static String oneLine(String s) {
        return s.replaceAll("\\p{Cntrl}+", " ").replaceAll("\\s{2,}", " ").strip();
    }
}
