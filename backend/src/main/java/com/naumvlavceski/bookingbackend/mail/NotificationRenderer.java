package com.naumvlavceski.bookingbackend.mail;

import org.springframework.web.util.HtmlUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/** Turns a notification into email content. */
final class NotificationRenderer {
    static final String IMPORTED = "EXTERNAL_RESERVATION_IMPORTED";
    static final String CANCELLED = "EXTERNAL_RESERVATION_CANCELLED";
    static final String MODIFIED = "EXTERNAL_RESERVATION_MODIFIED";
    static final String SYNC_FAILING = "CALENDAR_SYNC_FAILING";

    record Rendered(String subject, String html, String text) {}

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMM yyyy");

    private NotificationRenderer() {}

    static String dates(LocalDate start, LocalDate end) {
        long nights = ChronoUnit.DAYS.between(start, end);
        return start.format(DATE) + " → " + end.format(DATE)
                + " (" + nights + (nights == 1 ? " night)" : " nights)");
    }

    private static String esc(String s) {
        return HtmlUtils.htmlEscape(s);
    }

    static Rendered render(Notification n, String unsubscribeUrl) {
        Rendered r = body(n);
        return new Rendered(r.subject(),
                r.html() + "<hr><p style=\"color:#666;font-size:12px\">You get this because booking notifications are on for your RoomTrack account. "
                        + "<a href=\"" + esc(unsubscribeUrl) + "\">Unsubscribe</a></p>",
                r.text() + "\n--\nYou get this because booking notifications are on for your RoomTrack account.\n"
                        + "Unsubscribe: " + unsubscribeUrl + "\n");
    }

    private static Rendered body(Notification n) {
        String platform = n.platform();
        String place = n.place();
        if (SYNC_FAILING.equals(n.type())) {
            String reason = n.detail() == null ? "Unknown error" : n.detail();
            return new Rendered(
                    platform + " calendar sync is failing: " + place,
                    "<p>The <b>" + esc(platform) + "</b> calendar for <b>" + esc(place)
                            + "</b> keeps failing to sync, so new bookings and cancellations may be missing.</p>"
                            + "<p><b>Details:</b> " + esc(reason) + "</p>"
                            + "<p>Check that the calendar link is still valid in RoomTrack.</p>",
                    "The " + platform + " calendar for " + place
                            + " keeps failing to sync, so new bookings and cancellations may be missing.\n\n"
                            + "Details: " + reason + "\n\nCheck that the calendar link is still valid in RoomTrack.");
        }
        String prefix;
        String verb;
        switch (n.type()) {
            case CANCELLED -> { prefix = "Cancelled"; verb = "was cancelled on"; }
            case MODIFIED -> { prefix = "Changed"; verb = "was changed on"; }
            default -> { prefix = "New"; verb = "was imported from"; }
        }
        boolean modified = MODIFIED.equals(n.type());
        String label = modified ? "New dates" : "Dates";
        String current = dates(n.startDate(), n.endDate());
        String previous = modified ? dates(n.prevStart(), n.prevEnd()) : null;
        String guest = n.guest() == null || n.guest().isBlank() ? "" : n.guest();

        String text = "A reservation " + verb + " " + platform + ".\n\nPlace: " + place + "\n"
                + (previous == null ? "" : "Previous dates: " + previous + "\n")
                + label + ": " + current + "\n"
                + (guest.isEmpty() ? "" : "Guest: " + guest + "\n");
        String html = "<p>A reservation " + verb + " <b>" + esc(platform) + "</b>.</p>"
                + "<p><b>Place:</b> " + esc(place) + "<br>"
                + (previous == null ? "" : "<b>Previous dates:</b> " + esc(previous) + "<br>")
                + "<b>" + label + ":</b> " + esc(current)
                + (guest.isEmpty() ? "" : "<br><b>Guest:</b> " + esc(guest)) + "</p>";
        return new Rendered(prefix + " " + platform + " reservation: " + place, html, text);
    }
}
