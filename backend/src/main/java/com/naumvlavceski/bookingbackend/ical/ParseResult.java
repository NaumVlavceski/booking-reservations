package com.naumvlavceski.bookingbackend.ical;

import java.util.List;
import java.util.Set;

/**
 * What could be read from a feed.
 *
 * @param events       the usable events
 * @param rejectedUids events we can name but not use (dates in the wrong order, too long a stay, ...): they are still
 *                     in the feed, so their bookings must not be treated as gone
 * @param unreadable   entries we cannot even name (no UID, cut off): any booking might be one of them
 */
public record ParseResult(List<ParsedIcalEvent> events, Set<String> rejectedUids, int unreadable) {

    public static ParseResult complete(List<ParsedIcalEvent> events) {
        return new ParseResult(events, Set.of(), 0);
    }

    public int skipped() {
        return rejectedUids.size() + unreadable;
    }
}
