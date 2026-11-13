import {describe, expect, it} from "vitest";
import {stayNights} from "./pricing";
import {parseLocalDate} from "./dates";

// Runs in the "unit" (Europe/Skopje), "tz-la" (America/Los_Angeles) and "tz-kiritimati" (UTC+14) projects.
describe("time zone pitfalls", () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    it("the project's time zone is really applied", () => {
        // TEST_TZ comes from vitest.config.ts (no Node types in tsconfig.app.json, hence the cast)
        const wanted = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.TEST_TZ;
        expect(zone).toBe(wanted);
        expect(["Europe/Skopje", "America/Los_Angeles", "Pacific/Kiritimati"]).toContain(zone);
        if (zone === "Pacific/Kiritimati") expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-840);
        if (zone === "America/Los_Angeles") expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480);
    });

    it("new Date('yyyy-MM-dd') is UTC midnight, which is the previous local day west of UTC", () => {
        const utc = new Date("2026-03-29");
        const localDay = utc.getDate();
        if (zone === "America/Los_Angeles") expect(localDay).toBe(28); // the bug parseLocalDate avoids
        else expect(localDay).toBe(29);
        expect(parseLocalDate("2026-03-29").getDate()).toBe(29);
    });

    it("stayNights does not depend on the zone (both ends parsed as UTC)", () => {
        expect(stayNights("2026-03-28", "2026-03-30")).toBe(2);
        expect(stayNights("2026-10-24", "2026-10-26")).toBe(2);
        expect(stayNights("2026-03-07", "2026-03-09")).toBe(2); // US spring forward
        expect(stayNights("2026-10-31", "2026-11-02")).toBe(2); // US fall back
    });

    it("a local-midnight difference across DST is not a whole number of days (why stayNights uses UTC)", () => {
        const ms = parseLocalDate("2026-03-30").getTime() - parseLocalDate("2026-03-28").getTime();
        const days = ms / 86_400_000;
        if (zone === "Europe/Skopje") expect(days).toBeCloseTo(47 / 24, 5);
        if (zone === "Pacific/Kiritimati") expect(days).toBe(2); // no DST there
        expect(Math.round(days)).toBe(2);
    });
});
