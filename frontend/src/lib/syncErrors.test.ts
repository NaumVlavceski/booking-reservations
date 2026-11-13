import {describe, expect, it} from "vitest";
import {describeSyncError, PLATFORM_NAME} from "./syncErrors";

const title = (raw: string | null, platform = "BOOKING") => describeSyncError(raw, platform).title;

describe("describeSyncError", () => {
    it.each([
        ["HTTP 404", "Booking.com says this calendar link no longer exists."],
        ["HTTP 410", "Booking.com says this calendar link no longer exists."],
        ["HTTP 401", "Booking.com refused this calendar link."],
        ["HTTP 403", "Booking.com refused this calendar link."],
        ["HTTP 500", "Booking.com is having problems right now."],
        ["HTTP 503 Service Unavailable", "Booking.com is having problems right now."],
        ["HTTP 302", "Booking.com didn't return the calendar."],
        ["HTTP 429", "Booking.com didn't return the calendar."],
        ["Response is not an iCal feed", "That link isn't a calendar export."],
        ["3 events could not be read", "Some entries in this calendar couldn't be read."],
        ["Feed was cut off", "Booking.com sent an incomplete calendar."],
        ["Feed exceeds size cap", "That calendar is unusually large."],
        ["Read timed out", "Booking.com didn't answer in time."],
        ["Connect timeout", "Booking.com didn't answer in time."],
        ["PKIX path building failed", "A secure connection to Booking.com couldn't be made."],
        ["SSL handshake aborted", "A secure connection to Booking.com couldn't be made."],
        ["Host could not be resolved", "This calendar link can't be reached."],
        ["Refusing private address", "This calendar link can't be reached."],
        ["Invalid feed URL", "This calendar link can't be reached."],
        ["java.lang.NullPointerException", "Couldn't sync with Booking.com."],
        ["", "Couldn't sync with Booking.com."],
    ])("%j → %s", (raw, expected) => {
        expect(title(raw)).toBe(expected);
    });

    it("null raw error", () => {
        expect(describeSyncError(null, "BOOKING")).toEqual({
            title: "Couldn't sync with Booking.com.",
            advice: "Try again. If it keeps failing, replace the calendar link in this room's settings.",
        });
    });

    it("advice names the platform", () => {
        expect(describeSyncError("HTTP 404", "BOOKING").advice).toContain("from Booking.com");
    });

    it("an unknown platform code is shown as is", () => {
        expect(title("HTTP 404", "VRBO")).toBe("VRBO says this calendar link no longer exists.");
    });

    it("Airbnb leftover: legacy AIRBNB calendars still read 'Airbnb' (out of scope, reported)", () => {
        expect(PLATFORM_NAME.AIRBNB).toBe("Airbnb");
        expect(title("HTTP 404", "AIRBNB")).toBe("Airbnb says this calendar link no longer exists.");
    });

    it("the first match wins: a status code beats the text after it", () => {
        expect(title("HTTP 200 but not an iCal feed")).toBe("Booking.com didn't return the calendar.");
    });
});
