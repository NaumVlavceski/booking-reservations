import {describe, expect, it} from "vitest";
import {repriceForm, stayNights, type PricingField} from "./pricing";
import type {ReservationRequest} from "./api/reservations";

// Shared cases written by the backend business audit (Docs/testing/fixtures/price-cases.json): what pricing.ts must
// compute, and what the API stores for each kind of amount. Loaded through Vite so no Node types are needed; when the
// file is missing the suite is skipped.
const found = import.meta.glob("../../../Docs/testing/fixtures/price-cases.json", {eager: true, import: "default"});
const fixture = Object.values(found)[0] as undefined | {
    stayNights: {name: string; checkIn: string; checkOut: string; expected: number | string}[];
    repriceForm: {name: string; input: Record<string, unknown>; lastEdited: PricingField; expected: Record<string, unknown> | null; sameReference?: boolean}[];
    backend: {cases: {sent: unknown; status: number; stored?: string | null; code?: string}[]};
};

const fromJson = (v: unknown) => (v === "NaN" ? NaN : v === "Infinity" ? Infinity : v);

describe.skipIf(!fixture)("price-cases.json (shared with the backend audit)", () => {
    it.each(fixture?.stayNights ?? [])("stayNights: $name", ({checkIn, checkOut, expected}) => {
        expect(stayNights(checkIn, checkOut)).toEqual(fromJson(expected));
    });

    it.each(fixture?.repriceForm ?? [])("repriceForm: $name", ({input, lastEdited, expected, sameReference}) => {
        const form = {
            unitId: "u", status: "CONFIRMED", guestName: "", guestEmail: "", guestPhone: "", notes: "",
            pricePerGuest: null, nightlyRate: null, totalAmount: null, ...input,
        } as unknown as ReservationRequest;
        const out = repriceForm(form, lastEdited);
        if (sameReference) expect(out).toBe(form);
        if (expected) {
            for (const [k, v] of Object.entries(expected)) {
                expect(out[k as keyof ReservationRequest], k).toEqual(fromJson(v));
            }
        }
    });

    it("every amount the form derives already has at most 2 decimals, so the server stores what the owner saw", () => {
        for (const c of fixture?.repriceForm ?? []) {
            const form = {unitId: "u", status: "CONFIRMED", guestName: "", guestEmail: "", guestPhone: "", notes: "",
                pricePerGuest: null, nightlyRate: null, totalAmount: null, ...c.input} as unknown as ReservationRequest;
            const out = repriceForm(form, c.lastEdited);
            for (const k of ["pricePerGuest", "nightlyRate", "totalAmount"] as const) {
                if (k === c.lastEdited) continue; // typed by the user, sent as typed
                const v = out[k];
                if (typeof v === "number" && Number.isFinite(v)) expect(Number(v.toFixed(2)), `${c.name} ${k}`).toBe(v);
            }
        }
    });

    it("backend storage cases match what the form can send", () => {
        const cases = fixture?.backend.cases ?? [];
        // The form sends "" for a cleared field: stored as no amount, not 0
        expect(cases.find((x) => x.sent === "")?.stored ?? null).toBeNull();
        // A typed value with 3 decimals is rounded half-up by the database (the form showed it unrounded)
        expect(cases.find((x) => x.sent === 10.005)?.stored).toBe("10.01");
        // 100,000,000 does not fit numeric(10,2): 409 CONFLICT (FE-10 / backend)
        expect(cases.find((x) => x.sent === 100000000)?.status).toBe(409);
    });
});
