import {describe, expect, it} from "vitest";
import {amountDue, layoutBarLabel, type BarLabelInput} from "./barLabel.ts";

// 6px per character keeps the arithmetic easy to follow.
const measure = (t: string) => t.length * 6;

const bar = (over: Partial<BarLabelInput> = {}): BarLabelInput => ({
    name: "Naum Vlavcheski",
    amount: null,
    width: 300,
    height: 60,
    cut: 60,
    cutLeft: true,
    cutRight: true,
    lineHeight: 16,
    fontSizes: [12],
    glyphRatio: 10 / 12,
    padding: 6,
    measure,
    ...over,
});

describe("layoutBarLabel", () => {
    it("keeps a name that fits on one line, starting from its first letter", () => {
        const lines = layoutBarLabel(bar()).lines;
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({kind: "name", text: "Naum Vlavcheski"});
    });

    it("wraps a name that doesn't fit onto two lines at a word boundary", () => {
        const lines = layoutBarLabel(bar({width: 150})).lines;
        expect(lines.map((l) => l.text)).toEqual(["Naum", "Vlavcheski"]);
    });

    it("leaves the rest for the second line, where CSS adds the ellipsis", () => {
        const lines = layoutBarLabel(bar({width: 150, name: "Naum Vlavcheski and family"})).lines;
        expect(lines.map((l) => l.text)).toEqual(["Naum", "Vlavcheski and family"]);
    });

    it("keeps a single over-long word on one line instead of breaking it", () => {
        const lines = layoutBarLabel(bar({width: 110, name: "Christophersonovski"})).lines;
        expect(lines).toHaveLength(1);
        expect(lines[0].text).toBe("Christophersonovski");
    });

    it("follows the slope: lower lines start further left", () => {
        const [first, second] = layoutBarLabel(bar({width: 150})).lines;
        expect(second.top).toBeGreaterThan(first.top);
        expect(second.left).toBeLessThan(first.left);
    });

    it("stays inside the cut edges", () => {
        for (const line of layoutBarLabel(bar({width: 150, amount: "385"})).lines) {
            const centre = line.top + 8;
            const leftEdge = 60 * (1 - centre / 60);
            const rightEdge = 150 - 60 * (centre / 60);
            expect(line.left).toBeGreaterThanOrEqual(leftEdge);
            expect(line.left + line.width).toBeLessThanOrEqual(rightEdge);
        }
    });

    it("uses the full width when the bar continues off-screen on both sides", () => {
        const [line] = layoutBarLabel(bar({cutLeft: false, cutRight: false})).lines;
        expect(line.left).toBe(6);
        expect(line.width).toBe(300 - 12);
    });

    it("puts the amount line above the name", () => {
        const lines = layoutBarLabel(bar({amount: "385"})).lines;
        expect(lines.map((l) => l.kind)).toEqual(["amount", "name"]);
        expect(lines[0].top).toBeLessThan(lines[1].top);
    });

    it("steps down to a smaller font only when the first word doesn't fit", () => {
        // 0.5 px per character per px of font size: "Naum" is 24px at 12px, 22px at 11px.
        const sized = (t: string, size: number) => t.length * size * 0.5;
        const roomy = layoutBarLabel(bar({measure: sized, fontSizes: [12, 11]}));
        expect(roomy.fontSize).toBe(12);
        const tight = layoutBarLabel(bar({width: 95, padding: 1, measure: sized, fontSizes: [12, 11]}));
        expect(tight.fontSize).toBe(11);
        expect(tight.lines[0].text).toBe("Naum");
    });

    it("centres the label when every line fits", () => {
        expect(layoutBarLabel(bar({amount: "385"})).align).toBe("center");
        expect(layoutBarLabel(bar({width: 150})).align).toBe("center"); // "Naum" / "Vlavcheski" both fit
    });

    it("starts from the first letter when the name has to be cut", () => {
        const label = layoutBarLabel(bar({width: 150, name: "Naum Vlavcheski and family"}));
        expect(label.align).toBe("left");
    });

    it("drops lines too narrow to show anything", () => {
        expect(layoutBarLabel(bar({width: 70, cut: 60})).lines).toEqual([]);
    });
});

describe("amountDue", () => {
    it("shows the total for bookings that aren't paid", () => {
        expect(amountDue("CONFIRMED", 385)).toEqual({text: "385", missing: false});
    });

    it("shows a flagged 0 when no total was recorded", () => {
        expect(amountDue("CONFIRMED", null)).toEqual({text: "0", missing: true});
        expect(amountDue("CONFIRMED", 0)).toEqual({text: "0", missing: true});
    });

    it("shows nothing for paid bookings and blocked dates", () => {
        expect(amountDue("PAID", 385)).toBeNull();
        expect(amountDue("BLOCK", null)).toBeNull();
    });
});
