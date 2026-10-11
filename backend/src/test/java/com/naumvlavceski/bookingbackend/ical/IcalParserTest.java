package com.naumvlavceski.bookingbackend.ical;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class IcalParserTest {

    private static String feed(String... events) {
        return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + String.join("", events) + "END:VCALENDAR\r\n";
    }

    private static String event(String body) {
        return "BEGIN:VEVENT\r\n" + body + "END:VEVENT\r\n";
    }

    @Test
    void parsesDateOnlyEvent() {
        List<ParsedIcalEvent> events = IcalParser.parse(feed(event(
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
        List<ParsedIcalEvent> events = IcalParser.parse(feed(event(
                "UID:x\r\nDTSTART:20300610T140000Z\r\nDTEND:20300612T100000Z\r\n")));
        assertEquals(LocalDate.of(2030, 6, 10), events.get(0).startDate());
        assertEquals(LocalDate.of(2030, 6, 12), events.get(0).endDate());
    }

    @Test
    void unfoldsWrappedLinesAndUnescapesText() {
        List<ParsedIcalEvent> events = IcalParser.parse(feed(event(
                "UID:very-long-\r\n uid-value\r\nDTSTART;VALUE=DATE:20300101\r\nDTEND;VALUE=DATE:20300102\r\n"
                        + "SUMMARY:Smith\\, John\\; family\r\n")));
        assertEquals("very-long-uid-value", events.get(0).uid());
        assertEquals("Smith, John; family", events.get(0).summary());
    }

    @Test
    void toleratesLfOnlyLineEndings() {
        List<ParsedIcalEvent> events = IcalParser.parse(
                "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:u\nDTSTART;VALUE=DATE:20300101\nDTEND;VALUE=DATE:20300103\nEND:VEVENT\nEND:VCALENDAR\n");
        assertEquals(1, events.size());
    }

    @Test
    void skipsIncompleteOrMalformedEventsButKeepsGoodOnes() {
        List<ParsedIcalEvent> events = IcalParser.parse(feed(
                event("DTSTART;VALUE=DATE:20300101\r\nDTEND;VALUE=DATE:20300102\r\n"),
                event("UID:no-end\r\nDTSTART;VALUE=DATE:20300101\r\n"),
                event("UID:bad-date\r\nDTSTART;VALUE=DATE:20301399\r\nDTEND;VALUE=DATE:20300102\r\n"),
                event("UID:good\r\nDTSTART;VALUE=DATE:20300201\r\nDTEND;VALUE=DATE:20300203\r\n")));
        assertEquals(1, events.size());
        assertEquals("good", events.get(0).uid());
    }

    @Test
    void emptyOrNullInputGivesNoEvents() {
        assertTrue(IcalParser.parse(null).isEmpty());
        assertTrue(IcalParser.parse("   ").isEmpty());
        assertTrue(IcalParser.parse("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n").isEmpty());
    }

    @Test
    void hashIsStableAndSensitiveToChanges() {
        assertEquals(IcalParser.hash("a"), IcalParser.hash("a"));
        assertNotEquals(IcalParser.hash("a"), IcalParser.hash("b"));
        assertEquals(64, IcalParser.hash("a").length());
    }
}
