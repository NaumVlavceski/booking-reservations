import {describe, expect, it} from "vitest";
import {blockedNights, canCheckOutOn, showAsBooked} from "./stayDates";
import {parseLocalDate} from "./dates";

const D = parseLocalDate;
const sorted = (s: Set<string>) => [...s].sort();

describe("blockedNights", () => {
    it("is half-open: the check-out day stays free", () => {
        expect(sorted(blockedNights([{checkIn: "2026-12-01", checkOut: "2026-12-04"}]))).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    });
    it("one night", () => {
        expect(sorted(blockedNights([{checkIn: "2026-12-01", checkOut: "2026-12-02"}]))).toEqual(["2026-12-01"]);
    });
    it("across a year end", () => {
        expect(sorted(blockedNights([{checkIn: "2026-12-30", checkOut: "2027-01-02"}]))).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    });
    it("across a month end", () => {
        expect(sorted(blockedNights([{checkIn: "2026-01-30", checkOut: "2026-02-02"}]))).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"]);
    });
    it("29 Feb 2028", () => {
        expect(sorted(blockedNights([{checkIn: "2028-02-28", checkOut: "2028-03-01"}]))).toEqual(["2028-02-28", "2028-02-29"]);
    });
    it("2027 has no 29 Feb", () => {
        expect(sorted(blockedNights([{checkIn: "2027-02-28", checkOut: "2027-03-01"}]))).toEqual(["2027-02-28"]);
    });
    it("DST nights are each counted once (spring forward and fall back)", () => {
        expect(sorted(blockedNights([{checkIn: "2026-03-28", checkOut: "2026-03-30"}]))).toEqual(["2026-03-28", "2026-03-29"]);
        expect(sorted(blockedNights([{checkIn: "2026-10-24", checkOut: "2026-10-26"}]))).toEqual(["2026-10-24", "2026-10-25"]);
        expect(sorted(blockedNights([{checkIn: "2026-03-07", checkOut: "2026-03-09"}]))).toEqual(["2026-03-07", "2026-03-08"]);
    });
    it("skips empty and backwards ranges", () => {
        expect(blockedNights([{checkIn: "2026-12-01", checkOut: "2026-12-01"}, {checkIn: "2026-12-05", checkOut: "2026-12-02"}]).size).toBe(0);
    });
    it("merges overlapping ranges", () => {
        expect(sorted(blockedNights([
            {checkIn: "2026-12-01", checkOut: "2026-12-03"},
            {checkIn: "2026-12-02", checkOut: "2026-12-04"},
        ]))).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    });
    it("handles a long stay (a year)", () => {
        expect(blockedNights([{checkIn: "2028-01-01", checkOut: "2029-01-01"}]).size).toBe(366);
    });
    it("no ranges", () => {
        expect(blockedNights([]).size).toBe(0);
    });
});

describe("canCheckOutOn", () => {
    const blocked = blockedNights([{checkIn: "2026-12-05", checkOut: "2026-12-08"}]);
    it("anything is fine before a check-in is picked", () => {
        expect(canCheckOutOn(D("2026-12-06"), undefined, blocked)).toBe(true);
    });
    it("not on or before the check-in", () => {
        expect(canCheckOutOn(D("2026-12-02"), D("2026-12-02"), blocked)).toBe(false);
        expect(canCheckOutOn(D("2026-12-01"), D("2026-12-02"), blocked)).toBe(false);
    });
    it("back-to-back: leaving the morning the next guest arrives is allowed", () => {
        expect(canCheckOutOn(D("2026-12-05"), D("2026-12-02"), blocked)).toBe(true);
    });
    it("not when a night in between is taken", () => {
        expect(canCheckOutOn(D("2026-12-06"), D("2026-12-02"), blocked)).toBe(false);
        expect(canCheckOutOn(D("2026-12-10"), D("2026-12-02"), blocked)).toBe(false);
    });
    it("arriving on another stay's check-out day", () => {
        expect(canCheckOutOn(D("2026-12-10"), D("2026-12-08"), blocked)).toBe(true);
    });
    it("across DST and a year end", () => {
        const none = new Set<string>();
        expect(canCheckOutOn(D("2026-10-26"), D("2026-10-24"), none)).toBe(true);
        expect(canCheckOutOn(D("2027-01-02"), D("2026-12-30"), none)).toBe(true);
        expect(canCheckOutOn(D("2028-03-01"), D("2028-02-29"), none)).toBe(true);
    });
});

describe("showAsBooked", () => {
    const blocked = blockedNights([{checkIn: "2026-12-05", checkOut: "2026-12-08"}]);
    it("a free day is never painted booked", () => {
        expect(showAsBooked(D("2026-12-04"), "checkIn", undefined, blocked)).toBe(false);
    });
    it("a taken night is painted booked when picking a check-in", () => {
        expect(showAsBooked(D("2026-12-05"), "checkIn", undefined, blocked)).toBe(true);
    });
    it("on the check-out step a day you may pick is not painted booked", () => {
        expect(showAsBooked(D("2026-12-05"), "checkOut", D("2026-12-02"), blocked)).toBe(false);
    });
    it("on the check-out step a taken day you may not pick stays painted", () => {
        expect(showAsBooked(D("2026-12-06"), "checkOut", D("2026-12-02"), blocked)).toBe(true);
    });
});
