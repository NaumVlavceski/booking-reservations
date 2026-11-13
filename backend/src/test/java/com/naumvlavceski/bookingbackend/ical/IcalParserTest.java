package com.naumvlavceski.bookingbackend.ical;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class IcalParserTest {

    private static String feed(String... events) {
        return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + String.join("", events) + "END:VCALENDAR\r\n";
    }

    private static String event(String body) {
        return "BEGIN:VEVENT\r\n" + body + "END:VEVENT\r\n";
    }

    private static List<ParsedIcalEvent> parse(String ics) {
        return IcalParser.parse(ics).events();
    }

    @Test
    void parsesDateOnlyEvent() {
        List<ParsedIcalEvent> events = parse(feed(event(
                "UID:abc@airbnb\r\nDTSTART;VALUE=DATE:20300610\r\nDTEND;VALUE=DATE:20300615\r\nSUMMARY:Reserved\r\n")));
        assertEquals(1, events.size());
        ParsedIcalEvent e = events.get(0);
        assertEquals("abc@airbnb", e.uid());
        assertEquals(LocalDate.of(2030, 6, 10), e.startDate());
        assertEquals(LocalDate.of(2030, 6, 15), e.endDate());
        assertEquals("Reserved", e.summary());
    }

    @Test
    void parsesDateTimeEventsKeepingOnlyTheDay() {
        List<ParsedIcalEvent> events = parse(feed(event(
                "UID:x\r\nDTSTART:20300610T140000Z\r\nDTEND:20300612T100000Z\r\n")));
        assertEquals(LocalDate.of(2030, 6, 10), events.get(0).startDate());
        assertEquals(LocalDate.of(2030, 6, 12), events.get(0).endDate());
    }

    @Test
    void unfoldsWrappedLinesAndUnescapesText() {
        List<ParsedIcalEvent> events = parse(feed(event(
                "UID:very-long-\r\n uid-value\r\nDTSTART;VALUE=DATE:20300101\r\nDTEND;VALUE=DATE:20300102\r\n"
                        + "SUMMARY:Smith\\, John\\; family\r\n")));
        assertEquals("very-long-uid-value", events.get(0).uid());
        assertEquals("Smith, John; family", events.get(0).summary());
    }

    @Test
    void toleratesLfOnlyLineEndings() {
        List<ParsedIcalEvent> events = parse(
                "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:u\nDTSTART;VALUE=DATE:20300101\nDTEND;VALUE=DATE:20300103\nEND:VEVENT\nEND:VCALENDAR\n");
        assertEquals(1, events.size());
    }

    @Test
    void skipsIncompleteOrMalformedEventsButKeepsGoodOnesAndReportsThem() {
        ParseResult result = IcalParser.parse(feed(
                event("DTSTART;VALUE=DATE:20300101\r\nDTEND;VALUE=DATE:20300102\r\n"),
                event("UID:no-end\r\nDTSTART;VALUE=DATE:20300101\r\n"),
                event("UID:bad-date\r\nDTSTART;VALUE=DATE:20301399\r\nDTEND;VALUE=DATE:20300102\r\n"),
                event("UID:good\r\nDTSTART;VALUE=DATE:20300201\r\nDTEND;VALUE=DATE:20300203\r\n")));
        assertEquals(1, result.events().size());
        assertEquals("good", result.events().get(0).uid());
        assertEquals(Set.of("no-end", "bad-date"), result.rejectedUids());
        assertEquals(1, result.unreadable(), "the event without a UID");
        assertEquals(3, result.skipped());
    }

    @Test
    void refusesStaysThatMakeNoSense() {
        ParseResult result = IcalParser.parse(feed(
                event("UID:reversed\r\nDTSTART;VALUE=DATE:20300720\r\nDTEND;VALUE=DATE:20300710\r\n"),
                event("UID:zero-nights\r\nDTSTART;VALUE=DATE:20300901\r\nDTEND;VALUE=DATE:20300901\r\n"),
                event("UID:same-day-timed\r\nDTSTART:20300901T100000Z\r\nDTEND:20300901T120000Z\r\n"),
                event("UID:century\r\nDTSTART;VALUE=DATE:19000101\r\nDTEND;VALUE=DATE:21000101\r\n"),
                // MAX_NIGHTS is 800 since 2026-11-13 (Booking.com closes a room for ~18 months in one event): 801 nights
                event("UID:too-long\r\nDTSTART;VALUE=DATE:20300101\r\nDTEND;VALUE=DATE:20320312\r\n"),
                event("UID:year-zero\r\nDTSTART;VALUE=DATE:00000101\r\nDTEND;VALUE=DATE:00000105\r\n"),
                event("UID:good\r\nDTSTART;VALUE=DATE:20300201\r\nDTEND;VALUE=DATE:20300203\r\n")));
        assertEquals(1, result.events().size());
        assertEquals(6, result.rejectedUids().size());
    }

    @Test
    void valuesTheDatabaseCouldNotStoreCannotFailTheFeed() {
        ParseResult result = IcalParser.parse(feed(
                event("UID:long-name\r\nDTSTART;VALUE=DATE:20300201\r\nDTEND;VALUE=DATE:20300203\r\nSUMMARY:" + "G".repeat(300) + "\r\n"),
                event("UID:" + "U".repeat(600) + "\r\nDTSTART;VALUE=DATE:20300301\r\nDTEND;VALUE=DATE:20300303\r\n"),
                event("UID:nul-name\r\nDTSTART;VALUE=DATE:20300401\r\nDTEND;VALUE=DATE:20300403\r\nSUMMARY:a\0b\r\n")));
        assertEquals(2, result.events().size());
        assertEquals(255, result.events().get(0).summary().length());
        assertEquals("ab", result.events().get(1).summary());
        assertEquals(1, result.rejectedUids().size(), "the UID that is too long to store");
    }

    @Test
    void anEventThatIsCutOffCountsAsUnreadable() {
        ParseResult result = IcalParser.parse("BEGIN:VCALENDAR\r\n"
                + event("UID:good\r\nDTSTART;VALUE=DATE:20300201\r\nDTEND;VALUE=DATE:20300203\r\n")
                + "BEGIN:VEVENT\r\nUID:cut\r\nDTSTART;VAL");
        assertEquals(1, result.events().size());
        assertEquals(1, result.unreadable());
    }

    @Test
    void namesAreCaseInsensitive() {
        List<ParsedIcalEvent> events = parse("begin:vcalendar\r\nbegin:vevent\r\nuid:u\r\n"
                + "dtstart;value=date:20300101\r\ndtend;value=date:20300103\r\nsummary:Ana\r\nend:vevent\r\nend:vcalendar\r\n");
        assertEquals(1, events.size());
        assertEquals("u", events.get(0).uid());
        assertEquals("Ana", events.get(0).summary());
    }

    @Test
    void emptyOrNullInputGivesNoEvents() {
        assertTrue(parse(null).isEmpty());
        assertTrue(parse("   ").isEmpty());
        assertTrue(parse("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n").isEmpty());
    }

    @Test
    void hashIsStableAndSensitiveToChanges() {
        assertEquals(IcalParser.hash("a"), IcalParser.hash("a"));
        assertNotEquals(IcalParser.hash("a"), IcalParser.hash("b"));
        assertEquals(64, IcalParser.hash("a").length());
    }
}
