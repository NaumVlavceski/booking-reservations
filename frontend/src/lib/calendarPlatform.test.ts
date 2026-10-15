import {describe, expect, it} from "vitest";
import {detectPlatform, normalizeIcsUrl} from "./calendarPlatform";

describe("detectPlatform", () => {
    it("recognises Booking.com feeds", () => {
        expect(detectPlatform("https://ical.booking.com/v1/export?t=abc123")).toBe("BOOKING");
        expect(detectPlatform("HTTPS://ICAL.BOOKING.COM/v1/export?t=abc")).toBe("BOOKING");
    });

    it("recognises Airbnb feeds in every country domain", () => {
        expect(detectPlatform("https://www.airbnb.com/calendar/ical/123.ics?s=abc")).toBe("AIRBNB");
        expect(detectPlatform("https://airbnb.mk/calendar/ical/123.ics")).toBe("AIRBNB");
        expect(detectPlatform("https://www.airbnb.co.uk/calendar/ical/123.ics")).toBe("AIRBNB");
        expect(detectPlatform("https://www.airbnb.com.au/calendar/ical/123.ics")).toBe("AIRBNB");
    });

    it("looks at the host only", () => {
        expect(detectPlatform("https://example.com/booking.com/airbnb.com.ics")).toBeNull();
        expect(detectPlatform("https://example.com/feed.ics?from=ical.booking.com")).toBeNull();
        expect(detectPlatform("https://booking.com.evil.com/a.ics")).toBeNull();
        expect(detectPlatform("https://evilbooking.com/a.ics")).toBeNull();
        expect(detectPlatform("https://airbnb.evil.com/a.ics")).toBeNull();
        expect(detectPlatform("https://notairbnb.com/a.ics")).toBeNull();
    });

    it("does not recognise other or unfinished links", () => {
        expect(detectPlatform("https://calendar.google.com/calendar/ical/x/basic.ics")).toBeNull();
        expect(detectPlatform("not a link")).toBeNull();
        expect(detectPlatform("")).toBeNull();
        expect(detectPlatform("https://")).toBeNull();
    });

    it("accepts webcal:// links", () => {
        expect(detectPlatform("webcal://ical.booking.com/v1/export?t=abc")).toBe("BOOKING");
    });
});

describe("normalizeIcsUrl", () => {
    it("turns webcal into https and trims", () => {
        expect(normalizeIcsUrl("  webcal://ical.booking.com/v1/export?t=abc ")).toBe("https://ical.booking.com/v1/export?t=abc");
        expect(normalizeIcsUrl("WEBCAL://www.airbnb.com/calendar/ical/1.ics")).toBe("https://www.airbnb.com/calendar/ical/1.ics");
    });

    it("leaves ordinary links alone", () => {
        expect(normalizeIcsUrl(" https://example.com/a.ics ")).toBe("https://example.com/a.ics");
    });
});
