package com.naumvlavceski.bookingbackend.audit.ical;

import com.naumvlavceski.bookingbackend.ical.IcalParser;
import com.naumvlavceski.bookingbackend.ical.ParseResult;
import com.naumvlavceski.bookingbackend.ical.ParsedIcalEvent;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.calendar;
import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.event;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Audit of {@link IcalParser} (pure unit tests, no Spring, no network). Complements ical/IcalParserTest.
 * Several tests here DOCUMENT current behaviour on purpose (names start with "documents"): the report says whether
 * that behaviour is a risk.
 */
class IcalParserAuditTest {

    private static final LocalDate JAN1 = LocalDate.of(2027, 1, 1);
    private static final LocalDate JAN4 = LocalDate.of(2027, 1, 4);

    private static ParsedIcalEvent only(ParseResult r) {
        assertEquals(1, r.events().size(), () -> "events: " + r.events() + " rejected " + r.rejectedUids()
                + " unreadable " + r.unreadable());
        return r.events().getFirst();
    }

    // ---- line endings and folding -------------------------------------------------------------------------

    @Test
    void crlfAndLfAndMixedLineEndingsReadTheSame() {
        String crlf = calendar(event("a@booking.com", JAN1, JAN4, "Ana"));
        String lf = crlf.replace("\r\n", "\n");
        String mixed = crlf.replaceFirst("\r\n", "\n");
        for (String feed : List.of(crlf, lf, mixed)) {
            ParsedIcalEvent e = only(IcalParser.parse(feed));
            assertEquals("a@booking.com", e.uid());
            assertEquals(JAN1, e.startDate());
            assertEquals(JAN4, e.endDate());
            assertEquals("Ana", e.summary());
        }
    }

    @Test
    void foldedLinesWithSpaceOrTabAreJoined() {
        String feed = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n"
                + "UID:very-long-uid-\r\n part-two\r\n\tpart-three@booking.com\r\n"
                + "DTSTART;VALUE=DATE:2027\r\n 0101\r\n"
                + "DTEND;VALUE=DATE:20270104\r\n"
                + "SUMMARY:Ana\r\n  Petrova\r\n"
                + "END:VEVENT\r\nEND:VCALENDAR\r\n";
        ParsedIcalEvent e = only(IcalParser.parse(feed));
        assertEquals("very-long-uid-part-twopart-three@booking.com", e.uid());
        assertEquals(JAN1, e.startDate());
        assertEquals("Ana Petrova", e.summary(), "only the first whitespace character of a continuation is removed");
    }

    @Test
    void foldBetweenTheTwoHalvesOfAnEmojiIsRestored() {
        // At the String level a fold can only fall between UTF-16 chars; unfolding puts the surrogate pair back.
        String feed = calendar("BEGIN:VEVENT\r\nUID:e@booking.com\r\nDTSTART;VALUE=DATE:20270101\r\n"
                + "DTEND;VALUE=DATE:20270104\r\nSUMMARY:Party \uD83C\r\n \uDF89 time\r\nEND:VEVENT\r\n");
        assertEquals("Party 🎉 time", only(IcalParser.parse(feed)).summary());
    }

    // ---- text ---------------------------------------------------------------------------------------------

    @Test
    void nonLatinSummariesSurvive() {
        for (String name : List.of("Марија Петровска", "Ђорђе Јовановић", "שרה כהן", "مريم أحمد", "Zoë 😀 🇲🇰",
                "李小龍", "Ana\\, Petrova\\; VIP")) {
            String expected = name.replace("\\,", ",").replace("\\;", ";");
            assertEquals(expected, only(IcalParser.parse(calendar(event("x@booking.com", JAN1, JAN4, name)))).summary(), name);
        }
    }

    @Test
    void documentsThatNewlineEscapesInASummaryAreNotUnescaped() {
        // RFC 5545 TEXT also escapes newlines as \n / \N; only \, \; and \\ are handled. Cosmetic (guest name shows "\n").
        String summary = only(IcalParser.parse(calendar(event("x@booking.com", JAN1, JAN4, "Ana\\nPetrova")))).summary();
        assertEquals("Ana\\nPetrova", summary);
    }

    @Test
    void aByteOrderMarkBeforeTheCalendarIsHarmless() {
        ParsedIcalEvent e = only(IcalParser.parse("﻿" + calendar(event("bom@booking.com", JAN1, JAN4, "Ana"))));
        assertEquals("bom@booking.com", e.uid());
    }

    @Test
    void propertyNamesAndParametersAreCaseInsensitive() {
        String feed = "begin:vcalendar\r\nbegin:vevent\r\nuid:lc@booking.com\r\ndtstart;value=date:20270101\r\n"
                + "dtend;value=date:20270104\r\nsummary:Ana\r\nend:vevent\r\nend:vcalendar\r\n";
        assertEquals("lc@booking.com", only(IcalParser.parse(feed)).uid());
    }

    // ---- dates and times ----------------------------------------------------------------------------------

    @Test
    void allDayDatesAndDateTimesGiveTheSameDays() {
        String dateOnly = "BEGIN:VEVENT\r\nUID:a@x\r\nDTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270104\r\nEND:VEVENT\r\n";
        String withTzid = "BEGIN:VEVENT\r\nUID:b@x\r\nDTSTART;TZID=Europe/Skopje:20270101T140000\r\n"
                + "DTEND;TZID=Europe/Skopje:20270104T100000\r\nEND:VEVENT\r\n";
        String utc = "BEGIN:VEVENT\r\nUID:c@x\r\nDTSTART:20270101T140000Z\r\nDTEND:20270104T100000Z\r\nEND:VEVENT\r\n";
        ParseResult r = IcalParser.parse(calendar(dateOnly, withTzid, utc));
        assertEquals(3, r.events().size());
        for (ParsedIcalEvent e : r.events()) {
            assertEquals(JAN1, e.startDate(), e.uid());
            assertEquals(JAN4, e.endDate(), e.uid());
        }
    }

    @Test
    void documentsThatTimeAndTimeZoneAreIgnored() {
        // 23:00 UTC on 25 Oct 2026 is already 26 Oct in Skopje (UTC+1 after the DST change that night).
        String feed = calendar("BEGIN:VEVENT\r\nUID:tz@x\r\nDTSTART:20261025T230000Z\r\nDTEND:20261027T230000Z\r\nEND:VEVENT\r\n");
        ParsedIcalEvent e = only(IcalParser.parse(feed));
        LocalDate localArrival = ZonedDateTime.of(2026, 10, 25, 23, 0, 0, 0, ZoneId.of("UTC"))
                .withZoneSameInstant(ZoneId.of("Europe/Skopje")).toLocalDate();
        assertEquals(LocalDate.of(2026, 10, 26), localArrival);
        assertEquals(LocalDate.of(2026, 10, 25), e.startDate(), "the parser keeps the UTC calendar day: one day early for Skopje");
        assertEquals(LocalDate.of(2026, 10, 27), e.endDate());
    }

    @Test
    void documentsThatAnEventWithoutDtendIsRejectedEvenWithDuration() {
        // RFC 5545: no DTEND + DATE start = one day; DURATION may replace DTEND. Both are refused (and reported).
        String noEnd = "BEGIN:VEVENT\r\nUID:noend@x\r\nDTSTART;VALUE=DATE:20270101\r\nEND:VEVENT\r\n";
        String duration = "BEGIN:VEVENT\r\nUID:dur@x\r\nDTSTART;VALUE=DATE:20270101\r\nDURATION:P3D\r\nEND:VEVENT\r\n";
        ParseResult r = IcalParser.parse(calendar(noEnd, duration));
        assertTrue(r.events().isEmpty());
        assertEquals(java.util.Set.of("noend@x", "dur@x"), r.rejectedUids(), "named, so they still count as 'in the feed'");
        assertEquals(0, r.unreadable());
    }

    @Test
    void endBeforeOrOnStartIsRejectedButStillCountsAsPresent() {
        String backwards = event("back@x", JAN4, JAN1, "Ana");
        String zeroNights = event("zero@x", JAN1, JAN1, "Ana");
        ParseResult r = IcalParser.parse(calendar(backwards, zeroNights));
        assertTrue(r.events().isEmpty());
        assertEquals(java.util.Set.of("back@x", "zero@x"), r.rejectedUids());
        assertEquals(2, r.skipped());
    }

    // ---- identity -----------------------------------------------------------------------------------------

    @Test
    void anEventWithoutUidIsUnreadableAndMakesTheReadPartial() {
        ParseResult r = IcalParser.parse(calendar(event(null, JAN1, JAN4, "No uid"), event("ok@x", JAN4, JAN4.plusDays(2), "Ok")));
        assertEquals(1, r.events().size());
        assertEquals(1, r.unreadable(), "a partial read: the reconciler then cancels nothing");
    }

    @Test
    void documentsThatDuplicateUidsInOneFeedAreBothReturned() {
        // The parser does not de-duplicate; what the reconciler does with it is tested end to end (ICAL-05).
        ParseResult r = IcalParser.parse(calendar(event("dup@x", JAN1, JAN4, "First"),
                event("dup@x", JAN4.plusDays(10), JAN4.plusDays(12), "Second")));
        assertEquals(2, r.events().size());
        assertEquals(List.of("dup@x", "dup@x"), r.events().stream().map(ParsedIcalEvent::uid).toList());
    }

    @Test
    void sameEventGivesSameHashAndChangedDatesGiveANewOne() {
        String a = event("h@x", JAN1, JAN4, "Ana");
        String moved = event("h@x", JAN1, JAN4.plusDays(1), "Ana");
        ParsedIcalEvent first = only(IcalParser.parse(calendar(a)));
        ParsedIcalEvent again = only(IcalParser.parse(calendar(a)));
        ParsedIcalEvent changed = only(IcalParser.parse(calendar(moved)));
        assertEquals(IcalParser.hash(first.rawBlock()), IcalParser.hash(again.rawBlock()));
        assertNotEquals(IcalParser.hash(first.rawBlock()), IcalParser.hash(changed.rawBlock()));
    }

    @Test
    void documentsThatAChangingDtstampChangesTheHash() {
        // If a channel stamps every export with the time of the download, every sync takes the "changed" path.
        String t1 = event("s@x", JAN1, JAN4, "Ana", "DTSTAMP:20261111T100000Z\r\n");
        String t2 = event("s@x", JAN1, JAN4, "Ana", "DTSTAMP:20261111T101000Z\r\n");
        assertNotEquals(IcalParser.hash(only(IcalParser.parse(calendar(t1))).rawBlock()),
                IcalParser.hash(only(IcalParser.parse(calendar(t2))).rawBlock()));
    }

    @Test
    void documentsThatStatusCancelledIsIgnoredByTheParser() {
        // STATUS is not read: a cancelled event comes back as a normal one. End-to-end consequence: ICAL-04.
        ParsedIcalEvent e = only(IcalParser.parse(calendar(event("c@x", JAN1, JAN4, "Ana", "STATUS:CANCELLED\r\n"))));
        assertEquals("c@x", e.uid());
    }

    // ---- empty, malformed, big ----------------------------------------------------------------------------

    @Test
    void anEmptyCalendarIsACompleteEmptyRead() {
        ParseResult r = IcalParser.parse(calendar());
        assertTrue(r.events().isEmpty());
        assertEquals(0, r.skipped());
        assertEquals(0, IcalParser.parse("").skipped());
        assertEquals(0, IcalParser.parse(null).skipped());
    }

    @Test
    void malformedInputNeverThrows() {
        List<String> inputs = List.of(
                "garbage", "BEGIN:VCALENDAR\r\n\0\0\0\r\nEND:VCALENDAR", "BEGIN:VEVENT", "END:VEVENT",
                "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:2027\r\nDTEND:ABCDEFGH\r\nEND:VEVENT\r\nEND:VCALENDAR",
                "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:\r\nDTEND\r\nEND:VEVENT\r\nEND:VCALENDAR",
                "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nBEGIN:VEVENT\r\nUID:x\r\nEND:VEVENT\r\nEND:VCALENDAR",
                "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:" + "u".repeat(10_000) + "\r\nEND:VEVENT\r\nEND:VCALENDAR",
                "\r\n \r\n\t\r\n");
        for (String in : inputs) {
            ParseResult r = assertDoesNotThrow(() -> IcalParser.parse(in), in.length() > 60 ? in.substring(0, 60) : in);
            assertTrue(r.events().isEmpty(), in);
        }
        // An unterminated event makes the read partial
        ParseResult cut = IcalParser.parse("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART;VALUE=DATE:20270101\r\n");
        assertEquals(1, cut.unreadable());
    }

    @Test
    void fiveThousandEventsParseQuickly() {
        String feed = Feeds.manyEvents(5_000, JAN1, "bulk-");
        long t0 = System.nanoTime();
        ParseResult r = IcalParser.parse(feed);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        Feeds.recordTiming("parse 5000 events (" + feed.length() / 1024 + " KiB): " + ms + " ms");
        assertEquals(5_000, r.events().size());
        assertEquals(0, r.skipped());
        assertTrue(ms < 10_000, "took " + ms + " ms");
    }

    @Test
    void aFeedNearTheFiveMegabyteCapParsesQuickly() {
        // ~4.9 MiB: 25,000 events of ~200 bytes (the most a capped download can hold is about this many)
        StringBuilder sb = new StringBuilder("BEGIN:VCALENDAR\r\n");
        int n = 0;
        while (sb.length() < 4_900 * 1024) {
            LocalDate d = LocalDate.of(2027, 1, 1).plusDays(n % 20_000);
            sb.append(event("near-cap-" + n + "-xxxxxxxxxxxxxxxxxxxxxxxx@booking.com", d, d.plusDays(1),
                    "CLOSED - Not available", "DTSTAMP:20261111T100000Z\r\n"));
            n++;
        }
        sb.append("END:VCALENDAR\r\n");
        long t0 = System.nanoTime();
        ParseResult r = IcalParser.parse(sb.toString());
        long ms = (System.nanoTime() - t0) / 1_000_000;
        Feeds.recordTiming("parse " + n + " events, " + sb.length() / 1024 + " KiB: " + ms + " ms");
        assertEquals(n, r.events().size());
        assertTrue(ms < 20_000, "took " + ms + " ms");
    }
}
