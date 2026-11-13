import {describe, expect, it} from "vitest";
import {formatStay, formatStayDays, formatWhen, parseLocalDate} from "./dates";

// Local date-times built with the Date constructor, so expectations hold in every time zone the suite runs in.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 11, 11, 10, 0);

describe("parseLocalDate", () => {
    it("gives local midnight of that calendar day", () => {
        const d = parseLocalDate("2026-11-11");
        expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 11, 0, 0]);
    });

    it.each(["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01", "2026-12-31", "2027-01-01"])(
        "%s (DST change days in Europe and the US, year end) keeps the same calendar day",
        (iso) => {
            const d = parseLocalDate(iso);
            const [y, m, day] = iso.split("-").map(Number);
            expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([y, m, day]);
        },
    );

    it("29 Feb 2028 is valid", () => {
        const d = parseLocalDate("2028-02-29");
        expect([d.getMonth(), d.getDate()]).toEqual([1, 29]);
    });

    it("29 Feb 2027 silently rolls over to 1 Mar (no validation; only server dates reach it)", () => {
        const d = parseLocalDate("2027-02-29");
        expect([d.getMonth(), d.getDate()]).toEqual([2, 1]);
    });

    it("malformed input gives Invalid Date", () => {
        expect(Number.isNaN(parseLocalDate("not-a-date").getTime())).toBe(true);
        expect(Number.isNaN(parseLocalDate("").getTime())).toBe(true);
    });
});

describe("formatStay", () => {
    it.each([
        ["2026-10-14", "2026-10-17", "14–17 Oct"],
        ["2026-10-28", "2026-11-02", "28 Oct – 2 Nov"],
        ["2026-12-28", "2027-01-03", "28 Dec 2026 – 3 Jan 2027"],
        ["2027-10-14", "2027-10-17", "14–17 Oct 2027"],
        ["2027-01-28", "2027-02-02", "28 Jan – 2 Feb 2027"],
        ["2025-12-30", "2026-01-02", "30 Dec 2025 – 2 Jan 2026"],
        ["2026-03-28", "2026-03-30", "28–30 Mar"],
        ["2026-10-24", "2026-10-26", "24–26 Oct"],
        ["2028-02-28", "2028-03-01", "28 Feb – 1 Mar 2028"],
        ["2026-10-14", "2026-10-14", "14–14 Oct"], // same day: odd but harmless (never a real stay)
    ])("%s → %s = %s", (a, b, expected) => {
        expect(formatStay(a, b, NOW)).toBe(expected);
    });

    it("on 31 Dec a stay into January shows both years", () => {
        expect(formatStay("2026-12-30", "2027-01-02", at(2026, 12, 31))).toBe("30 Dec 2026 – 2 Jan 2027");
    });

    it("on 1 Jan a stay that ends today shows both years", () => {
        expect(formatStay("2026-12-30", "2027-01-01", at(2027, 1, 1, 0, 30))).toBe("30 Dec 2026 – 1 Jan 2027");
    });

    it("on 1 Jan a stay this year has no year", () => {
        expect(formatStay("2027-01-05", "2027-01-07", at(2027, 1, 1, 0, 0))).toBe("5–7 Jan");
    });
});

describe("formatStayDays", () => {
    it("adds weekdays", () => {
        expect(formatStayDays("2026-10-14", "2026-10-17", NOW)).toBe("Wed 14 Oct – Sat 17 Oct");
    });
    it("adds the year to both ends when either is not this year", () => {
        expect(formatStayDays("2026-12-31", "2027-01-02", NOW)).toBe("Thu 31 Dec 2026 – Sat 2 Jan 2027");
    });
    it("29 Feb 2028 is a Tuesday", () => {
        expect(formatStayDays("2028-02-29", "2028-03-01", NOW)).toBe("Tue 29 Feb 2028 – Wed 1 Mar 2028");
    });
});

describe("formatWhen", () => {
    it("null / empty is 'never'", () => {
        expect(formatWhen(null, NOW)).toBe("never");
        expect(formatWhen("", NOW)).toBe("never");
    });
    it("today", () => {
        expect(formatWhen(at(2026, 11, 11, 8, 5).toISOString(), NOW)).toBe("today, 08:05");
    });
    it("just after midnight is still today", () => {
        expect(formatWhen(at(2026, 11, 11, 0, 1).toISOString(), at(2026, 11, 11, 0, 2))).toBe("today, 00:01");
    });
    it("yesterday", () => {
        expect(formatWhen(at(2026, 11, 10, 23, 59).toISOString(), NOW)).toBe("yesterday, 23:59");
    });
    it("yesterday across a year boundary", () => {
        expect(formatWhen(at(2026, 12, 31, 22, 0).toISOString(), at(2027, 1, 1, 9, 0))).toBe("yesterday, 22:00");
    });
    it("yesterday across the October DST change", () => {
        expect(formatWhen(at(2026, 10, 25, 1, 30).toISOString(), at(2026, 10, 26, 9, 0))).toBe("yesterday, 01:30");
    });
    it("the day after the March DST change", () => {
        expect(formatWhen(at(2026, 3, 29, 12, 0).toISOString(), at(2026, 3, 30, 0, 30))).toBe("yesterday, 12:00");
    });
    it("yesterday across a month boundary (1 March in a leap year)", () => {
        expect(formatWhen(at(2028, 2, 29, 18, 0).toISOString(), at(2028, 3, 1, 9, 0))).toBe("yesterday, 18:00");
    });
    it("older this year: day and month", () => {
        expect(formatWhen(at(2026, 10, 3, 14, 0).toISOString(), NOW)).toBe("3 Oct, 14:00");
    });
    it("another year: with the year", () => {
        expect(formatWhen(at(2025, 10, 3, 14, 0).toISOString(), NOW)).toBe("3 Oct 2025, 14:00");
    });
    it("an ISO string without a zone is read as local time", () => {
        expect(formatWhen("2026-11-11T07:30:00", NOW)).toBe("today, 07:30");
    });
    it("an instant in UTC is shown in local time", () => {
        const iso = "2026-11-11T06:00:00Z";
        const local = new Date(iso);
        const hh = String(local.getHours()).padStart(2, "0");
        expect(formatWhen(iso, local)).toBe(`today, ${hh}:00`);
    });
    it("a time in the future (clock skew) does not crash", () => {
        expect(formatWhen(at(2026, 11, 12, 9, 0).toISOString(), NOW)).toBe("12 Nov, 09:00");
    });
});
