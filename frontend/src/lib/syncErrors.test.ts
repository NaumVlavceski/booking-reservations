import {describe, expect, it} from "vitest";
import {describeSyncError} from "./syncErrors.ts";

describe("describeSyncError", () => {
    it("explains a dead link and says how to fix it", () => {
        const p = describeSyncError("Feed returned HTTP 404", "BOOKING");
        expect(p.title).toBe("Booking.com says this calendar link no longer exists.");
        expect(p.advice).toContain("Copy a fresh calendar export link from Booking.com");
    });

    it("treats server errors on the channel's side as temporary", () => {
        expect(describeSyncError("Feed returned HTTP 503", "AIRBNB").title).toBe("Airbnb is having problems right now.");
    });

    it("recognises a link that isn't a calendar export", () => {
        expect(describeSyncError("Response is not an iCal feed", "AIRBNB").title).toBe("That link isn't a calendar export.");
    });

    it("hides Java certificate errors behind plain words", () => {
        const p = describeSyncError(
            "Failed after 3 attempts: (certificate_unknown) PKIX path building failed: sun.security.provider.certpath.SunCertPathBuilderException",
            "BOOKING");
        expect(p.title).toBe("A secure connection to Booking.com couldn't be made.");
        expect(p.advice).not.toMatch(/PKIX|sun\.security/);
    });

    it("recognises timeouts and unreachable hosts", () => {
        expect(describeSyncError("Failed after 3 attempts: HttpTimeoutException: request timed out", "AIRBNB").title)
            .toBe("Airbnb didn't answer in time.");
        expect(describeSyncError("Feed host could not be resolved", "AIRBNB").title)
            .toBe("This calendar link can't be reached.");
    });

    it("falls back to a generic message for anything unknown", () => {
        expect(describeSyncError("something odd", "BOOKING").title).toBe("Couldn't sync with Booking.com.");
        expect(describeSyncError(null, "AIRBNB").title).toBe("Couldn't sync with Airbnb.");
    });
});
