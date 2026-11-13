package com.naumvlavceski.bookingbackend.audit.ical;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/** Builds iCal text shaped like a Booking.com export (all-day VALUE=DATE events, CRLF line ends). */
public final class Feeds {
    private Feeds() {}

    public static String date(LocalDate d) {
        return d.format(DateTimeFormatter.BASIC_ISO_DATE);
    }

    public static String event(String uid, LocalDate start, LocalDate end, String summary) {
        return event(uid, start, end, summary, "");
    }

    /** {@code extraLines} are inserted as-is (each ending in CRLF). */
    public static String event(String uid, LocalDate start, LocalDate end, String summary, String extraLines) {
        return "BEGIN:VEVENT\r\n"
                + "DTSTART;VALUE=DATE:" + date(start) + "\r\n"
                + "DTEND;VALUE=DATE:" + date(end) + "\r\n"
                + (uid == null ? "" : "UID:" + uid + "\r\n")
                + (summary == null ? "" : "SUMMARY:" + summary + "\r\n")
                + extraLines
                + "END:VEVENT\r\n";
    }

    public static String calendar(String... events) {
        StringBuilder sb = new StringBuilder("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Stub//Booking.com like//EN\r\n");
        for (String e : events) sb.append(e);
        return sb.append("END:VCALENDAR\r\n").toString();
    }

    /** One-night events on consecutive days starting at {@code first}: never overlap each other. */
    public static String manyEvents(int count, LocalDate first, String uidPrefix) {
        StringBuilder sb = new StringBuilder(count * 160);
        sb.append("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
        for (int i = 0; i < count; i++) {
            sb.append(event(uidPrefix + i + "@booking.com", first.plusDays(i), first.plusDays(i + 1), "CLOSED - Not available"));
        }
        return sb.append("END:VCALENDAR\r\n").toString();
    }

    /** Timings go to target/ical-audit-timings.txt so the report can quote them. */
    public static void recordTiming(String line) {
        System.out.println("[ical-audit timing] " + line);
        try {
            Path out = Path.of("target", "ical-audit-timings.txt");
            Files.createDirectories(out.getParent());
            Files.writeString(out, line + System.lineSeparator(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ignored) {
            // timings are informational only
        }
    }
}
