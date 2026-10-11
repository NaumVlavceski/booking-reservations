import {describe, expect, it} from "vitest";
import {formatStay, formatStayDays, formatWhen} from "./dates.ts";

const now = new Date(2026, 9, 10, 20, 0); // 10 Oct 2026, 20:00 local

describe("formatStay", () => {
    it("writes a stay within one month compactly", () => {
        expect(formatStay("2026-10-14", "2026-10-17", now)).toBe("14–17 Oct");
    });

    it("names both months when the stay crosses one", () => {
        expect(formatStay("2026-10-28", "2026-11-02", now)).toBe("28 Oct – 2 Nov");
    });

    it("adds the year only when it isn't this year", () => {
        expect(formatStay("2027-03-01", "2027-03-04", now)).toBe("1–4 Mar 2027");
        expect(formatStay("2026-12-28", "2027-01-03", now)).toBe("28 Dec 2026 – 3 Jan 2027");
    });
});

describe("formatWhen", () => {
    it("says today / yesterday in words", () => {
        expect(formatWhen(new Date(2026, 9, 10, 7, 56).toISOString(), now)).toBe("today, 07:56");
        expect(formatWhen(new Date(2026, 9, 9, 8, 10).toISOString(), now)).toBe("yesterday, 08:10");
    });

    it("uses the date for anything older", () => {
        expect(formatWhen(new Date(2026, 9, 3, 14, 0).toISOString(), now)).toBe("3 Oct, 14:00");
    });

    it("says never when there's no timestamp", () => {
        expect(formatWhen(null, now)).toBe("never");
    });
});

describe("formatStayDays", () => {
    it("names the weekdays", () => {
        expect(formatStayDays("2026-10-14", "2026-10-17", now)).toBe("Wed 14 Oct – Sat 17 Oct");
    });

    it("adds the year when it isn't this year", () => {
        expect(formatStayDays("2027-01-06", "2027-01-08", now)).toBe("Wed 6 Jan 2027 – Fri 8 Jan 2027");
    });
});
