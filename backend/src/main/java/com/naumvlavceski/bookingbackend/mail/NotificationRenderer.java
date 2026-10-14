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
    static final String CONFLICT_NEW = "BOOKING_CONFLICT";
    static final String CONFLICT_CHANGED = "BOOKING_CONFLICT_CHANGED";

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
        if (CONFLICT_NEW.equals(n.type()) || CONFLICT_CHANGED.equals(n.type())) {
            boolean changed = CONFLICT_CHANGED.equals(n.type());
            String intro = changed
                    ? "A " + platform + " booking was changed and now overlaps one of your reservations."
                    : "A new " + platform + " booking overlaps one of your reservations.";
            String advice = "RoomTrack kept your existing booking" + (changed ? " as it was" : " and did not add the new one")
                    + ". Open Booking conflicts in RoomTrack, then cancel one of the two on its platform to avoid a double booking.";
            String incoming = dates(n.startDate(), n.endDate()) + (n.guest() == null || n.guest().isBlank() ? "" : " (" + n.guest() + ")");
            return new Rendered(
                    "Booking conflict at " + place + ": " + platform + " booking overlaps",
                    "<p><b>" + esc(intro) + "</b></p>"
                            + "<p><b>Place:</b> " + esc(place) + "<br>"
                            + "<b>" + esc(platform) + " booking:</b> " + esc(incoming) + "<br>"
                            + "<b>Your existing booking:</b> " + esc(n.detail()) + "</p>"
                            + "<p>" + esc(advice) + "</p>",
                    intro + "\n\nPlace: " + place + "\n" + platform + " booking: " + incoming + "\n"
                            + "Your existing booking: " + n.detail() + "\n\n" + advice);
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
        // For a changed booking the detail is the price the owner had entered, which the feed cannot update
        String priceWarning = modified && n.detail() != null
                ? "The price was not updated: it is still " + n.detail() + ". Please check it and change it for the new dates."
                : null;

        String text = "A reservation " + verb + " " + platform + ".\n\nPlace: " + place + "\n"
                + (previous == null ? "" : "Previous dates: " + previous + "\n")
                + label + ": " + current + "\n"
                + (guest.isEmpty() ? "" : "Guest: " + guest + "\n")
                + (priceWarning == null ? "" : "\n! " + priceWarning + "\n");
        String html = "<p>A reservation " + verb + " <b>" + esc(platform) + "</b>.</p>"
                + "<p><b>Place:</b> " + esc(place) + "<br>"
                + (previous == null ? "" : "<b>Previous dates:</b> " + esc(previous) + "<br>")
                + "<b>" + label + ":</b> " + esc(current)
                + (guest.isEmpty() ? "" : "<br><b>Guest:</b> " + esc(guest)) + "</p>"
                + (priceWarning == null ? "" : "<p style=\"color:#B91C1C\"><b>! " + esc(priceWarning) + "</b></p>");
        return new Rendered(prefix + " " + platform + " reservation: " + place, html, text);
    }
}
