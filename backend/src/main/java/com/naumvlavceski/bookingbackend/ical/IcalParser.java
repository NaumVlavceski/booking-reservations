package com.naumvlavceski.bookingbackend.ical;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class IcalParser {
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final Pattern VEVENT_PATTERN =
            Pattern.compile("BEGIN:VEVENT(.*?)END:VEVENT", Pattern.DOTALL);

    public static List<ParsedIcalEvent> parse(String icsText) {
        List<ParsedIcalEvent> events = new ArrayList<>();
        if (icsText == null || icsText.isBlank()) {
            return events;
        }

        String unfolded = unfold(icsText);

        Matcher matcher = VEVENT_PATTERN.matcher(unfolded);
        while (matcher.find()) {
            String rawBlock = "BEGIN:VEVENT" + matcher.group(1) + "END:VEVENT";
            try {
                ParsedIcalEvent event = parseEvent(rawBlock);
                if (event != null) {
                    events.add(event);
                }
            } catch (Exception e) {
                // One malformed event must never take down the whole feed.
                // Skip it and move on — Day 34's error tracking is the
                // right place to surface this, not a thrown exception here.
            }
        }
        return events;
    }

    private static ParsedIcalEvent parseEvent(String rawBlock) {
        String uid = extractValue(rawBlock, "UID");
        LocalDate start = extractDate(rawBlock, "DTSTART");
        LocalDate end = extractDate(rawBlock, "DTEND");
        String summary = unescape(extractValue(rawBlock, "SUMMARY"));

        if (uid == null || start == null || end == null) {
            return null; // incomplete event, nothing safe to reconcile against
        }

        return new ParsedIcalEvent(uid, start, end, summary, rawBlock);
    }

    private static String extractValue(String block, String property) {
        for (String line : block.split("\r?\n")) {
            if (line.startsWith(property + ":") || line.startsWith(property + ";")) {
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
            if (line.startsWith(property + ":") || line.startsWith(property + ";")) {
                int colonIndex = line.indexOf(':');
                if (colonIndex == -1) continue;
                String value = line.substring(colonIndex + 1).trim();
                // Handles both VALUE=DATE (yyyyMMdd) and datetime forms
                // (yyyyMMdd'T'HHmmss[Z]) — we only ever care about the
                // calendar day, never the time of day, for blocking purposes
                String datePart = value.length() >= 8 ? value.substring(0, 8) : null;
                if (datePart == null) return null;
                try {
                    return LocalDate.parse(datePart, DATE_FMT);
                } catch (Exception e) {
                    return null;
                }
            }
        }
        return null;
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