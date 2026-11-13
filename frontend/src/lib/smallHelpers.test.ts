import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {detectPlatform, normalizeIcsUrl} from "./calendarPlatform";
import {bookingLabel, guestNameOf, isGenericSummary} from "./bookingLabel";

describe("calendarPlatform", () => {
    it.each([
        ["https://admin.booking.com/hotel/hoteladmin/ical.html?t=abc", "BOOKING"],
        ["https://booking.com/x.ics", "BOOKING"],
        ["webcal://admin.booking.com/x.ics", "BOOKING"],
        ["  WEBCAL://admin.booking.com/x.ics  ", "BOOKING"],
        ["https://ADMIN.BOOKING.COM/x", "BOOKING"],
        ["http://admin.booking.com/x", "BOOKING"], // the backend refuses http; the client only detects the platform
        ["https://booking.com.evil.example/x", null],
        ["https://evilbooking.com/x", null],
        ["https://booking.com%2eevil.example/x", null],
        ["https://www.airbnb.com/calendar/ical/1.ics", null],
        ["javascript:alert(1)//booking.com", null],
        ["not a url", null],
        ["", null],
    ])("%s → %s", (url, platform) => {
        expect(detectPlatform(url)).toBe(platform);
    });

    it("webcal is rewritten to https, everything else trimmed only", () => {
        expect(normalizeIcsUrl("webcal://a.booking.com/x")).toBe("https://a.booking.com/x");
        expect(normalizeIcsUrl(" https://a.booking.com/x ")).toBe("https://a.booking.com/x");
    });
});

describe("bookingLabel", () => {
    it.each(["CLOSED - Not available", "closed-not available", "Not available", "Reserved", "Blocked", "Airbnb (Not available)", "  Reserved  "])(
        "%j is a channel placeholder", (s) => expect(isGenericSummary(s)).toBe(true));
    it.each(["Reserved for Ana", "Ana", ""])("%j is not", (s) => expect(isGenericSummary(s)).toBe(false));

    it("placeholders from channels are not shown as guest names", () => {
        expect(guestNameOf({guestName: "CLOSED - Not available", status: "CONFIRMED", source: "BOOKING"})).toBe("");
        expect(bookingLabel({guestName: "CLOSED - Not available", status: "CONFIRMED", source: "BOOKING"})).toBe("Booking.com");
    });
    it("a direct booking keeps whatever the owner typed", () => {
        expect(guestNameOf({guestName: "Reserved", status: "CONFIRMED", source: "DIRECT"})).toBe("Reserved");
    });
    it("fallbacks", () => {
        expect(bookingLabel({guestName: "", status: "BLOCK", source: "DIRECT"})).toBe("Blocked");
        expect(bookingLabel({guestName: null, status: "CONFIRMED", source: "DIRECT"})).toBe("Reservation");
        expect(bookingLabel({guestName: "  Ana  ", status: "PAID", source: "DIRECT"})).toBe("Ana");
    });
});

// session.ts and formDraft.ts use sessionStorage / localStorage
class MemoryStorage {
    data = new Map<string, string>();
    getItem(k: string) {
        return this.data.get(k) ?? null;
    }
    setItem(k: string, v: string) {
        this.data.set(k, v);
    }
    removeItem(k: string) {
        this.data.delete(k);
    }
}

describe("session return path (open-redirect guard)", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal("sessionStorage", new MemoryStorage());
    });
    afterEach(() => vi.unstubAllGlobals());

    it.each([
        ["/dashboard/cancelled?x=1#y", "/dashboard/cancelled?x=1#y"],
        ["/dashboard", "/dashboard"],
        ["//evil.example/x", "/fallback"],
        ["https://evil.example/dashboard", "/fallback"],
        ["/login", "/fallback"],
        ["javascript:alert(1)", "/fallback"],
        ["", "/fallback"],
    ])("%j → %j", async (returnTo, expected) => {
        const s = await import("./auth/session");
        s.markSessionExpired(returnTo);
        expect(s.wasSessionExpired()).toBe(true);
        expect(s.takeReturnTo("/fallback")).toBe(expected);
        expect(s.takeReturnTo("/fallback")).toBe("/fallback"); // read once
    });

    it("a value planted directly in storage is checked again on the way out", async () => {
        const s = await import("./auth/session");
        sessionStorage.setItem("roomtrack.returnTo", "//evil.example");
        expect(s.takeReturnTo("/dashboard/calendar")).toBe("/dashboard/calendar");
    });
});

describe("formDraft (session-expiry draft)", () => {
    const jwt = (sub: string) => `x.${btoa(JSON.stringify({sub})).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.y`;
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal("sessionStorage", new MemoryStorage());
        vi.stubGlobal("localStorage", new MemoryStorage());
    });
    afterEach(() => vi.unstubAllGlobals());

    it("is restored only for the same path and the same account", async () => {
        const d = await import("./formDraft");
        localStorage.setItem("auth_token", jwt("ana@example.test"));
        d.setCurrentFormDraft({guestName: "Ана"});
        d.stashFormDraft("/dashboard/reservations/new?unitId=u1");
        expect(d.readFormDraft("/dashboard/reservations/new?unitId=u1")).toEqual({guestName: "Ана"});
        expect(d.readFormDraft("/dashboard/reservations/new?unitId=u2")).toBeNull();
        localStorage.setItem("auth_token", jwt("someone-else@example.test"));
        expect(d.readFormDraft("/dashboard/reservations/new?unitId=u1")).toBeNull();
        localStorage.removeItem("auth_token");
        expect(d.readFormDraft("/dashboard/reservations/new?unitId=u1")).toBeNull();
    });

    it("nothing is stashed when the form is clean", async () => {
        const d = await import("./formDraft");
        d.setCurrentFormDraft(null);
        d.stashFormDraft("/x");
        expect(sessionStorage.getItem("roomtrack.formDraft")).toBeNull();
    });

    it("a garbage token is no user", async () => {
        const d = await import("./formDraft");
        localStorage.setItem("auth_token", "garbage");
        d.setCurrentFormDraft({a: 1});
        d.stashFormDraft("/x");
        expect(d.readFormDraft("/x")).toBeNull();
    });
});
