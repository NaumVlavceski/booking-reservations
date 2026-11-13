import {describe, expect, it} from "vitest";
import {amountDue, layoutBarLabel, type BarLabelInput} from "./barLabel";

// A monospace-ish stand-in for canvas measureText: every character is 0.6 em wide.
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.6;

function input(overrides: Partial<BarLabelInput> = {}): BarLabelInput {
    return {
        name: "Ana Petrova", amount: null, width: 200, height: 40, cut: 10, cutLeft: true, cutRight: true,
        lineHeight: 14, fontSizes: [13, 11], glyphRatio: 0.7, padding: 4, measure, ...overrides,
    };
}

describe("layoutBarLabel", () => {
    it("a short name fits on one centred line", () => {
        const layout = layoutBarLabel(input());
        expect(layout.fontSize).toBe(13);
        expect(layout.align).toBe("center");
        expect(layout.lines.map((l) => [l.kind, l.text])).toEqual([["name", "Ana Petrova"]]);
    });

    it("with an amount, the amount line comes first", () => {
        const layout = layoutBarLabel(input({amount: "120"}));
        expect(layout.lines.map((l) => l.kind)).toEqual(["amount", "name"]);
        expect(layout.lines[0].top).toBeLessThan(layout.lines[1].top);
    });

    it("a long name wraps onto two lines at a word boundary", () => {
        const layout = layoutBarLabel(input({width: 90, name: "Maximilian von Hohenberg"}));
        expect(layout.lines.map((l) => l.text)).toEqual(["Maximilian", "von Hohenberg"]);
        // Each lower line starts further left (the parallelogram's slope)
        expect(layout.lines[1].left).toBeLessThan(layout.lines[0].left);
    });

    it("a single long word takes the smaller font", () => {
        const layout = layoutBarLabel(input({width: 70, name: "Hohenberg"}));
        expect(layout.fontSize).toBe(11);
    });

    it("a word that fits nowhere stays on one line, left-aligned (CSS ellipsis)", () => {
        const layout = layoutBarLabel(input({width: 40, name: "Supercalifragilistic"}));
        expect(layout.lines).toHaveLength(1);
        expect(layout.align).toBe("left");
    });

    it("empty and whitespace names draw nothing", () => {
        expect(layoutBarLabel(input({name: ""})).lines).toEqual([]);
        expect(layoutBarLabel(input({name: "   "})).lines).toEqual([]);
        expect(layoutBarLabel(input({name: "  ", amount: "50"})).lines.map((l) => l.kind)).toEqual(["amount"]);
    });

    it("empty fontSizes falls back to 12", () => {
        expect(layoutBarLabel(input({fontSizes: []})).fontSize).toBe(12);
    });

    it("lines narrower than 14px are dropped", () => {
        expect(layoutBarLabel(input({width: 30, cut: 10})).lines).toEqual([]);
    });

    it("no cut on a side that continues off-screen gives more room", () => {
        const cut = layoutBarLabel(input({cutLeft: true, cutRight: true}));
        const open = layoutBarLabel(input({cutLeft: false, cutRight: false}));
        expect(open.lines[0].width).toBeGreaterThan(cut.lines[0].width);
        expect(open.lines[0].left).toBe(4);
    });

    it("Cyrillic, emoji and RTL text lay out like any other text", () => {
        for (const name of ["Ивана Стојанова", "🏖️ Beach 🌊", "محمد علي"]) {
            const layout = layoutBarLabel(input({name}));
            expect(layout.lines.map((l) => l.text).join(" ")).toBe(name);
        }
    });

    it("markup in a name is just text", () => {
        const name = "<img src=x onerror=alert(1)>";
        expect(layoutBarLabel(input({name, width: 400})).lines[0].text).toBe(name);
    });
});

describe("amountDue", () => {
    const fmt = (n: number) => new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(n);

    it.each(["PAID", "BLOCK", "CANCELLED"])("%s shows nothing", (status) => {
        expect(amountDue(status, 120)).toBeNull();
    });

    it("an unpaid total", () => {
        expect(amountDue("CONFIRMED", 120)).toEqual({text: fmt(120), missing: false});
    });

    it("decimals up to two places", () => {
        expect(amountDue("CONFIRMED", 1234.5)).toEqual({text: fmt(1234.5), missing: false});
        expect(amountDue("CONFIRMED", 33.333)).toEqual({text: fmt(33.33), missing: false});
    });

    it.each([0, null, undefined, NaN])("a missing total (%s) is flagged", (total) => {
        expect(amountDue("CONFIRMED", total as number | null | undefined)).toEqual({text: "0", missing: true});
    });

    it("a total that needs review gets a '!'", () => {
        expect(amountDue("CONFIRMED", 300, true)).toEqual({text: `! ${fmt(300)}`, missing: false, review: true});
    });

    it("the number format follows the browser locale (mixes with English dates; see report)", () => {
        // In this Node process the default locale decides; en-US prints 1,234.5 and mk-MK 1.234,5.
        expect(new Intl.NumberFormat("mk-MK", {maximumFractionDigits: 2}).format(1234.5)).toBe("1.234,5");
        expect(new Intl.NumberFormat("en-US", {maximumFractionDigits: 2}).format(1234.5)).toBe("1,234.5");
    });
});
