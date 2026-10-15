import {describe, expect, it} from "vitest";
import {blockedNights, canCheckOutOn, showAsBooked} from "./stayDates";
import {parseLocalDate} from "./dates";

const d = parseLocalDate;
// Another guest stays 20 to 23 Oct 2030: nights of the 20th, 21st and 22nd are taken, the 23rd is free
const blocked = blockedNights([{checkIn: "2030-10-20", checkOut: "2030-10-23"}]);

describe("blockedNights", () => {
    it("holds the nights of a stay but not its check-out day", () => {
        expect([...blocked].sort()).toEqual(["2030-10-20", "2030-10-21", "2030-10-22"]);
    });

    it("ignores empty ranges", () => {
        expect(blockedNights([{checkIn: "2030-10-20", checkOut: "2030-10-20"}]).size).toBe(0);
    });
});

describe("canCheckOutOn", () => {
    it("allows leaving on the day another stay starts", () => {
        expect(canCheckOutOn(d("2030-10-20"), d("2030-10-17"), blocked)).toBe(true);
    });

    it("does not allow a stay to run into the other booking", () => {
        expect(canCheckOutOn(d("2030-10-21"), d("2030-10-17"), blocked)).toBe(false);
        expect(canCheckOutOn(d("2030-10-25"), d("2030-10-17"), blocked)).toBe(false);
    });

    it("needs at least one night", () => {
        expect(canCheckOutOn(d("2030-10-17"), d("2030-10-17"), blocked)).toBe(false);
        expect(canCheckOutOn(d("2030-10-16"), d("2030-10-17"), blocked)).toBe(false);
    });
});

describe("showAsBooked", () => {
    it("paints every taken night on the check-in step", () => {
        expect(showAsBooked(d("2030-10-20"), "checkIn", undefined, blocked)).toBe(true);
        expect(showAsBooked(d("2030-10-21"), "checkIn", undefined, blocked)).toBe(true);
    });

    it("does not paint the first night of the next stay when it is a valid check-out day", () => {
        expect(showAsBooked(d("2030-10-20"), "checkOut", d("2030-10-17"), blocked)).toBe(false);
    });

    it("still paints the nights you cannot check out on", () => {
        expect(showAsBooked(d("2030-10-21"), "checkOut", d("2030-10-17"), blocked)).toBe(true);
        expect(showAsBooked(d("2030-10-22"), "checkOut", d("2030-10-17"), blocked)).toBe(true);
    });

    it("never paints free days", () => {
        expect(showAsBooked(d("2030-10-19"), "checkIn", undefined, blocked)).toBe(false);
        expect(showAsBooked(d("2030-10-23"), "checkOut", d("2030-10-17"), blocked)).toBe(false);
    });
});
