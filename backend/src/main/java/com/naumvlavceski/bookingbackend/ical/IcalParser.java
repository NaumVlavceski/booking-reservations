package com.naumvlavceski.bookingbackend.ical;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class IcalParser {
    private static final Pattern VEVENT_PATTERN =
            Pattern.compile("BEGIN:VEVENT(.*?)END:VEVENT", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern VEVENT_START = Pattern.compile("BEGIN:VEVENT", Pattern.CASE_INSENSITIVE);

    /** No real stay is longer than this; anything longer would block a room for years. */
    private static final int MAX_NIGHTS = 800;
    private static final int MIN_YEAR = 2000;
    private static final int MAX_YEAR = 2100;
    /** The sizes of reservation.guest_name and external_event.uid. */
    private static final int MAX_SUMMARY_LENGTH = 255;
    private static final int MAX_UID_LENGTH = 500;

    /** Never throws: an entry that can't be used is counted in the result, so the caller knows the read was partial. */
    public static ParseResult parse(String icsText) {
        if (icsText == null || icsText.isBlank()) {
            return ParseResult.complete(List.of());
        }

        String unfolded = unfold(icsText);
        List<ParsedIcalEvent> events = new ArrayList<>();
        Set<String> rejectedUids = new HashSet<>();
        int unreadable = 0;

        int blocks = 0;
        Matcher matcher = VEVENT_PATTERN.matcher(unfolded);
        while (matcher.find()) {
            blocks++;
            String rawBlock = "BEGIN:VEVENT" + matcher.group(1) + "END:VEVENT";
            String uid = extractValue(rawBlock, "UID");
            ParsedIcalEvent event = parseEvent(rawBlock, uid);
            if (event != null) events.add(event);
            else if (uid != null) rejectedUids.add(uid);
            else unreadable++;
        }

        // A BEGIN with no END of its own
        unreadable += (int) VEVENT_START.matcher(unfolded).results().count() - blocks;

        return new ParseResult(events, rejectedUids, unreadable);
    }

    private static ParsedIcalEvent parseEvent(String rawBlock, String uid) {
        if (uid == null || uid.length() > MAX_UID_LENGTH || uid.indexOf('\0') >= 0) return null;

        LocalDate start = extractDate(rawBlock, "DTSTART");
        LocalDate end = extractDate(rawBlock, "DTEND");
        if (start == null || end == null || !isSaneStay(start, end)) return null;

        return new ParsedIcalEvent(uid, start, end, cleanSummary(extractValue(rawBlock, "SUMMARY")), rawBlock);
    }

    private static boolean isSaneStay(LocalDate start, LocalDate end) {
        return end.isAfter(start)
                && ChronoUnit.DAYS.between(start, end) <= MAX_NIGHTS
                && start.getYear() >= MIN_YEAR
                && end.getYear() <= MAX_YEAR;
    }

    private static String cleanSummary(String summary) {
        String text = unescape(summary);
        if (text == null) return null;
        text = text.replace("\0", "");
        if (text.length() <= MAX_SUMMARY_LENGTH) return text;
        // Don't cut an emoji or other two-part character in half
        int cut = Character.isHighSurrogate(text.charAt(MAX_SUMMARY_LENGTH - 1)) ? MAX_SUMMARY_LENGTH - 1 : MAX_SUMMARY_LENGTH;
        return text.substring(0, cut);
    }

    private static String extractValue(String block, String property) {
        for (String line : block.split("\r?\n")) {
            if (isProperty(line, property)) {
                int colonIndex = line.indexOf(':');
                if (colonIndex != -1 && colonIndex < line.length() - 1) {
                    return line.substring(colonIndex + 1).trim();
                }
            }
        }
        return null;
    }

    private static LocalDate extractDate(String block, String property) {
        for (String line : block.split("\r?\n")) {
            if (isProperty(line, property)) {
                int colonIndex = line.indexOf(':');
                if (colonIndex == -1) continue;
                String value = line.substring(colonIndex + 1).trim();
                String datePart = value.length() >= 8 ? value.substring(0, 8) : null;
                if (datePart == null) return null;
                try {
                    return LocalDate.parse(datePart, DateTimeFormatter.BASIC_ISO_DATE);
                } catch (DateTimeParseException e) {
                    return null;
                }
            }
        }
        return null;
    }

    /** Property names are case-insensitive in RFC 5545. */
    private static boolean isProperty(String line, String property) {
        return line.length() > property.length()
                && line.regionMatches(true, 0, property, 0, property.length())
                && (line.charAt(property.length()) == ':' || line.charAt(property.length()) == ';');
    }

    private static String unfold(String ics) {
        // Per RFC 5545, a long line may be split across multiple physical
        // lines, with each continuation line starting with a single space
        // or tab. Real-world feeds (Google Calendar in particular) do this.
        // Unfolding first prevents a wrapped SUMMARY or UID from silently
        // corrupting into two separate, broken lines.
        return ics.replaceAll("\r?\n[ \t]", "");
    }

    private static String unescape(String value) {
        if (value == null) return null;
        return value
                .replace("\\,", ",")
                .replace("\\;", ";")
                .replace("\\\\", "\\");
    }

    public static String hash(String rawBlock) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(rawBlock.getBytes());
            StringBuilder hex = new StringBuilder();
            for (byte b : hashBytes) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
