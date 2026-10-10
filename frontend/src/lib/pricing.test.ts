import {describe, expect, it} from "vitest";
import {repriceForm} from "./pricing.ts";
import type {ReservationRequest} from "./api/reservations.ts";

const base: ReservationRequest = {
    unitId: "u1", checkIn: "2030-06-10", checkOut: "2030-06-13", status: "CONFIRMED",
    pricePerGuest: null, nightlyRate: null, totalAmount: null,
    guestName: "", guestEmail: "", guestPhone: "", guestsCount: 2, notes: "",
};

describe("repriceForm", () => {
    it("derives total and per-guest price from the nightly rate", () => {
        const r = repriceForm({...base, nightlyRate: 50}, "nightlyRate");
        expect(r.totalAmount).toBe(150);
        expect(r.pricePerGuest).toBe(25);
    });

    it("derives nightly rate and per-guest price from the total", () => {
        const r = repriceForm({...base, totalAmount: 300}, "totalAmount");
        expect(r.nightlyRate).toBe(100);
        expect(r.pricePerGuest).toBe(50);
    });

    it("derives nightly rate and total from the per-guest price", () => {
        const r = repriceForm({...base, pricePerGuest: 20}, "pricePerGuest");
        expect(r.nightlyRate).toBe(40);
        expect(r.totalAmount).toBe(120);
    });

    it("settles: a second pass returns the very same object", () => {
        const once = repriceForm({...base, nightlyRate: 50}, "nightlyRate");
        expect(repriceForm(once, "nightlyRate")).toBe(once);
    });

    it("does nothing before both dates are set or when the stay is not positive", () => {
        const noCheckOut = {...base, nightlyRate: 50, checkOut: ""};
        expect(repriceForm(noCheckOut, "nightlyRate")).toBe(noCheckOut);
        const f = {...base, nightlyRate: 50};
        const same = {...f, checkOut: "2030-06-10"};
        expect(repriceForm(same, "nightlyRate")).toBe(same);
    });

    it("does nothing when nothing was edited or the edited field is empty", () => {
        const f = {...base, nightlyRate: 50};
        expect(repriceForm(f, null)).toBe(f);
        const empty = {...base};
        expect(repriceForm(empty, "nightlyRate")).toBe(empty);
    });

    it("recomputes when the number of guests changes", () => {
        const r = repriceForm({...base, nightlyRate: 60, guestsCount: 3}, "nightlyRate");
        expect(r.pricePerGuest).toBe(20);
    });

    it("rounds to cents", () => {
        const r = repriceForm({...base, totalAmount: 100}, "totalAmount");
        expect(r.nightlyRate).toBe(33.33);
    });
});
