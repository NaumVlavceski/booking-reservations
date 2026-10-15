import {describe, expect, it} from "vitest";
import {easeOutQuad, flingTail} from "./fling";

describe("flingTail", () => {
    it("travels about speed × tau", () => {
        const tail = flingTail(1, 200, 1000);
        expect(tail.distance).toBeCloseTo(200);
    });

    it("keeps the direction of the flick", () => {
        expect(flingTail(-1.5, 200, 1000).distance).toBeCloseTo(-300);
    });

    it("never goes further than the cap, however hard the flick", () => {
        expect(flingTail(30, 200, 315).distance).toBe(315);
        expect(flingTail(-30, 200, 315).distance).toBe(-315);
    });

    it("starts at the speed the glide had (ease-out-quad starts at 2·distance/duration)", () => {
        for (const speed of [0.5, 1, 4, -2]) {
            const tail = flingTail(speed, 200, 315);
            expect((2 * Math.abs(tail.distance)) / tail.durationMs).toBeCloseTo(Math.abs(speed));
        }
    });

    it("does nothing for no speed", () => {
        expect(flingTail(0, 200, 315)).toEqual({distance: 0, durationMs: 0});
    });
});

describe("easeOutQuad", () => {
    it("runs from 0 to 1 and slows down", () => {
        expect(easeOutQuad(0)).toBe(0);
        expect(easeOutQuad(1)).toBe(1);
        expect(easeOutQuad(0.5)).toBeGreaterThan(0.5);
        expect(easeOutQuad(-1)).toBe(0);
        expect(easeOutQuad(2)).toBe(1);
    });
});
