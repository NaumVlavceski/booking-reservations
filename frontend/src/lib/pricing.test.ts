import {describe, expect, it} from "vitest";
import {repriceForm, stayNights, type PricingField} from "./pricing";
import type {ReservationRequest} from "./api/reservations";

// Prices arrive as strings while typed (e.target.value) and as numbers once derived or loaded from the API.
// The type says number | null; the casts below reproduce what the form really holds.
type Price = number | string | null;

function form(overrides: Partial<Record<keyof ReservationRequest, unknown>> = {}): ReservationRequest {
    return {
        unitId: "u1",
        checkIn: "2026-12-01",
        checkOut: "2026-12-04", // 3 nights
        status: "CONFIRMED",
        pricePerGuest: null,
        nightlyRate: null,
        totalAmount: null,
        guestName: "",
        guestEmail: "",
        guestPhone: "",
        guestsCount: 2,
        notes: "",
        ...overrides,
    } as ReservationRequest;
}

const prices = (f: ReservationRequest) => ({
    totalAmount: f.totalAmount as Price,
    nightlyRate: f.nightlyRate as Price,
    pricePerGuest: f.pricePerGuest as Price,
});

describe("stayNights", () => {
    it.each([
        ["", "2026-12-04", 0],
        ["2026-12-01", "", 0],
        ["", "", 0],
        ["2026-12-01", "2026-12-02", 1],
        ["2026-12-01", "2026-12-04", 3],
        ["2026-12-04", "2026-12-01", 0], // check-out before check-in
        ["2026-12-01", "2026-12-01", 0], // same day
        // EU DST: clocks go forward on 2026-03-29 and back on 2026-10-25 (both parsed as UTC, so no 23/25 h days)
        ["2026-03-28", "2026-03-30", 2],
        ["2026-03-29", "2026-03-30", 1],
        ["2026-10-24", "2026-10-26", 2],
        ["2026-10-25", "2026-10-26", 1],
        ["2026-03-01", "2026-11-01", 245], // across both changes
        // Leap years
        ["2028-02-28", "2028-03-01", 2],
        ["2027-02-28", "2027-03-01", 1],
        ["2028-02-29", "2028-03-01", 1],
        // Month and year boundaries
        ["2026-01-31", "2026-02-01", 1],
        ["2026-12-31", "2027-01-01", 1],
        ["2026-12-28", "2027-01-03", 6],
        ["2026-01-01", "2027-01-01", 365],
        ["2028-01-01", "2029-01-01", 366],
    ])("%s → %s = %d nights", (checkIn, checkOut, nights) => {
        expect(stayNights(checkIn, checkOut)).toBe(nights);
    });

    it.fails("FE-07: a malformed date gives 0 nights, not NaN", () => {
        // new Date("2026-13-01") is Invalid Date and Math.max(0, NaN) is NaN; repriceForm then does not stop early.
        expect(stayNights("2026-13-01", "2026-12-04")).toBe(0);
    });
});

describe("repriceForm: total → per night and per guest", () => {
    it("divides the total by nights, then by guests, keeping the total as typed", () => {
        const next = repriceForm(form({totalAmount: "300"}), "totalAmount");
        expect(prices(next)).toEqual({totalAmount: "300", nightlyRate: 100, pricePerGuest: 50});
    });

    it("rounds thirds independently from the raw total (100 / 3 nights / 2 guests)", () => {
        const next = repriceForm(form({totalAmount: "100"}), "totalAmount");
        expect(prices(next)).toEqual({totalAmount: "100", nightlyRate: 33.33, pricePerGuest: 16.67});
    });

    it("works with a numeric total (as loaded from the API)", () => {
        const next = repriceForm(form({totalAmount: 100}), "totalAmount");
        expect(prices(next)).toEqual({totalAmount: 100, nightlyRate: 33.33, pricePerGuest: 16.67});
    });

    it("one guest, one night: all three are the same", () => {
        const next = repriceForm(form({checkOut: "2026-12-02", guestsCount: 1, totalAmount: "80"}), "totalAmount");
        expect(prices(next)).toEqual({totalAmount: "80", nightlyRate: 80, pricePerGuest: 80});
    });

    it("accepts decimals with a dot", () => {
        const next = repriceForm(form({totalAmount: "100.50"}), "totalAmount");
        expect(prices(next)).toEqual({totalAmount: "100.50", nightlyRate: 33.5, pricePerGuest: 16.75});
    });
});

describe("repriceForm: per night → total and per guest", () => {
    it("multiplies by nights; per guest is per guest per night", () => {
        const next = repriceForm(form({nightlyRate: "45.5"}), "nightlyRate");
        expect(prices(next)).toEqual({totalAmount: 136.5, nightlyRate: "45.5", pricePerGuest: 22.75});
    });

    it("33.33 per night for 3 nights is 99.99, not 100 (the total does not round-trip)", () => {
        const fromTotal = repriceForm(form({totalAmount: "100"}), "totalAmount");
        const edited = repriceForm({...fromTotal, nightlyRate: "33.33" as unknown as number}, "nightlyRate");
        expect(prices(edited)).toEqual({totalAmount: 99.99, nightlyRate: "33.33", pricePerGuest: 16.66});
    });
});

describe("repriceForm: per guest → per night and total", () => {
    it("multiplies by guests, then by nights", () => {
        const next = repriceForm(form({pricePerGuest: "20"}), "pricePerGuest");
        expect(prices(next)).toEqual({totalAmount: 120, nightlyRate: 40, pricePerGuest: "20"});
    });

    it("owner decision: changing guests keeps per guest and moves the total (18.33 × 3 = 54.99)", () => {
        // 55 for one night and 3 guests: per guest 18.33. A guests change sets lastEdited = pricePerGuest,
        // so the total is rebuilt from the rounded per-guest price. Accepted drift, not a bug.
        const start = repriceForm(form({checkOut: "2026-12-02", guestsCount: 3, totalAmount: "55"}), "totalAmount");
        expect(prices(start)).toEqual({totalAmount: "55", nightlyRate: 55, pricePerGuest: 18.33});
        const more = repriceForm({...start, guestsCount: 4}, "pricePerGuest");
        expect(prices(more)).toEqual({totalAmount: 73.32, nightlyRate: 73.32, pricePerGuest: 18.33});
        const back = repriceForm({...more, guestsCount: 3}, "pricePerGuest");
        expect(prices(back)).toEqual({totalAmount: 54.99, nightlyRate: 54.99, pricePerGuest: 18.33});
    });

    it("going down to one guest", () => {
        const next = repriceForm(form({pricePerGuest: 25, guestsCount: 1}), "pricePerGuest");
        expect(prices(next)).toEqual({totalAmount: 75, nightlyRate: 25, pricePerGuest: 25});
    });
});

describe("repriceForm: editing after another field was computed", () => {
    it("total, then per night: the per-night edit wins", () => {
        const a = repriceForm(form({totalAmount: "100"}), "totalAmount");
        const b = repriceForm({...a, nightlyRate: "40" as unknown as number}, "nightlyRate");
        expect(prices(b)).toEqual({totalAmount: 120, nightlyRate: "40", pricePerGuest: 20});
    });

    it("per night, then per guest", () => {
        const a = repriceForm(form({nightlyRate: "40"}), "nightlyRate");
        const b = repriceForm({...a, pricePerGuest: "30" as unknown as number}, "pricePerGuest");
        expect(prices(b)).toEqual({totalAmount: 180, nightlyRate: 60, pricePerGuest: "30"});
    });

    it("per guest, then total", () => {
        const a = repriceForm(form({pricePerGuest: "10"}), "pricePerGuest");
        const b = repriceForm({...a, totalAmount: "90" as unknown as number}, "totalAmount");
        expect(prices(b)).toEqual({totalAmount: "90", nightlyRate: 30, pricePerGuest: 15});
    });
});

describe("repriceForm: dates change after prices are set (what repriceForDates selects)", () => {
    it("with a nightly rate, the rate stays and the total follows the new nights", () => {
        const a = repriceForm(form({nightlyRate: "50"}), "nightlyRate"); // 3 nights → 150
        const b = repriceForm({...a, checkOut: "2026-12-06"}, "nightlyRate"); // 5 nights
        expect(prices(b)).toEqual({totalAmount: 250, nightlyRate: "50", pricePerGuest: 25});
    });

    it("with only a total, the total stays and the nightly rate follows", () => {
        const a = repriceForm(form({totalAmount: "300"}), "totalAmount");
        const b = repriceForm({...a, checkOut: "2026-12-07"}, "totalAmount"); // 6 nights
        expect(prices(b)).toEqual({totalAmount: "300", nightlyRate: 50, pricePerGuest: 25});
    });

    it("clearing a date stops repricing and keeps what is there", () => {
        const a = repriceForm(form({nightlyRate: "50"}), "nightlyRate");
        const b = {...a, checkOut: ""};
        expect(repriceForm(b, "nightlyRate")).toBe(b);
    });

    it("dates across DST and 29 Feb still give whole-night totals", () => {
        expect(prices(repriceForm(form({checkIn: "2026-03-28", checkOut: "2026-03-30", nightlyRate: "70"}), "nightlyRate")).totalAmount).toBe(140);
        expect(prices(repriceForm(form({checkIn: "2026-10-24", checkOut: "2026-10-26", nightlyRate: "70"}), "nightlyRate")).totalAmount).toBe(140);
        expect(prices(repriceForm(form({checkIn: "2028-02-28", checkOut: "2028-03-01", nightlyRate: "70"}), "nightlyRate")).totalAmount).toBe(140);
        expect(prices(repriceForm(form({checkIn: "2026-12-31", checkOut: "2027-01-01", nightlyRate: "70"}), "nightlyRate")).totalAmount).toBe(70);
    });
});

describe("repriceForm: inputs that must not compute anything", () => {
    const cases: [string, Partial<Record<keyof ReservationRequest, unknown>>, PricingField][] = [
        ["no field edited yet", {totalAmount: "100"}, null],
        ["empty string", {totalAmount: ""}, "totalAmount"],
        ["null", {nightlyRate: null}, "nightlyRate"],
        ["numeric 0", {pricePerGuest: 0}, "pricePerGuest"],
        ["text", {totalAmount: "abc"}, "totalAmount"],
        ["comma decimal (type=number gives '' or this)", {nightlyRate: "45,50"}, "nightlyRate"],
        ["NaN", {totalAmount: NaN}, "totalAmount"],
        ["no dates", {checkIn: "", checkOut: "", totalAmount: "100"}, "totalAmount"],
        ["check-out before check-in", {checkIn: "2026-12-05", checkOut: "2026-12-01", totalAmount: "100"}, "totalAmount"],
    ];
    it.each(cases)("%s → same object back", (_label, overrides, lastEdited) => {
        const f = form(overrides);
        expect(repriceForm(f, lastEdited)).toBe(f);
    });

    it("the string '0' is truthy and computes zeros (harmless)", () => {
        expect(prices(repriceForm(form({totalAmount: "0"}), "totalAmount"))).toEqual({totalAmount: "0", nightlyRate: 0, pricePerGuest: 0});
    });

    it("clearing the edited field leaves the other two stale (they are still sent)", () => {
        const a = repriceForm(form({totalAmount: "300"}), "totalAmount");
        const cleared = {...a, totalAmount: "" as unknown as number};
        expect(prices(repriceForm(cleared, "totalAmount"))).toEqual({totalAmount: "", nightlyRate: 100, pricePerGuest: 50});
    });
});

describe("repriceForm: render-loop safety", () => {
    it.each<PricingField>(["totalAmount", "nightlyRate", "pricePerGuest"])("a second pass returns the same object (%s)", (field) => {
        const f = form({[field as string]: "123.45"});
        const once = repriceForm(f, field);
        expect(once).not.toBe(f);
        expect(repriceForm(once, field)).toBe(once);
    });
});

describe("repriceForm: extreme values", () => {
    it("very small values round to 0", () => {
        expect(prices(repriceForm(form({nightlyRate: "0.001"}), "nightlyRate"))).toEqual({totalAmount: 0, nightlyRate: "0.001", pricePerGuest: 0});
    });

    it("large but storable values stay within a cent (numeric(10,2) max 99,999,999.99)", () => {
        // 99,999,999.99 / 3 / 2 = 16,666,666.665 exactly; toFixed gives .66 (binary rounding, see FE-09), not .67
        expect(prices(repriceForm(form({totalAmount: "99999999.99"}), "totalAmount"))).toEqual({
            totalAmount: "99999999.99", nightlyRate: 33333333.33, pricePerGuest: 16666666.66,
        });
    });

    it("a total above numeric(10,2) is computed without complaint (the form has no max; the server must refuse it)", () => {
        expect(prices(repriceForm(form({nightlyRate: "50000000"}), "nightlyRate")).totalAmount).toBe(150000000);
    });

    it("guestsCount 0 (never from the UI) divides by zero", () => {
        expect(prices(repriceForm(form({totalAmount: "100", guestsCount: 0}), "totalAmount")).pricePerGuest).toBe(Infinity);
    });

    it.fails("FE-08: a price that overflows becomes Infinity, which JSON sends as null (price silently lost)", () => {
        const next = repriceForm(form({pricePerGuest: "1e308"}), "pricePerGuest");
        expect(Number.isFinite(next.totalAmount as number)).toBe(true);
    });

    it.fails("FE-09: half-cent values round half-up like the database (1.005 → 1.01)", () => {
        // toFixed works on the binary double 1.00499999…, so 1.005 becomes 1.00; PostgreSQL numeric(10,2) gives 1.01.
        const next = repriceForm(form({checkOut: "2026-12-02", guestsCount: 1, nightlyRate: "1.005"}), "nightlyRate");
        expect(next.totalAmount).toBe(1.01);
    });
});
