/**
 * Text layout for a reservation bar on the calendar.
 *
 * A bar is a parallelogram: its top-left and bottom-right corners are cut
 * diagonally (`cut` px wide) to show afternoon check-in / morning check-out.
 * Every horizontal slice of it is the same width, but each slice starts
 * further left the lower it is. So each text line is positioned on its own,
 * following that slope, instead of one centred block that the cut would clip.
 *
 * The name starts at its first letter, wraps onto a second line if needed,
 * and anything still left over is ellipsised by CSS on the last line.
 */

export interface BarLabelInput {
    name: string;
    /** Amount line shown above the name, or null for none. */
    amount: string | null;
    width: number;
    height: number;
    cut: number;
    /** False when the bar continues off-screen on that side (no diagonal drawn there). */
    cutLeft: boolean;
    cutRight: boolean;
    lineHeight: number;
    /**
     * Name font sizes to try, largest first. A smaller one is used only when
     * the first word of the name doesn't fit at the larger size (one-night stays).
     */
    fontSizes: number[];
    /** Share of the font size kept clear of the slanted edge (roughly the x-height). */
    glyphRatio: number;
    padding: number;
    /** Font size of the amount line; defaults to a bit smaller than the name. */
    amountFontSize?: number;
    measure: (text: string, fontSize: number) => number;
}

export interface BarLabelLayout {
    fontSize: number;
    /**
     * "center" when every line fits in full; otherwise "left", so a name that
     * has to be cut still starts from its first letter.
     */
    align: "center" | "left";
    lines: BarLabelLine[];
}

export interface BarLabelLine {
    kind: "amount" | "name";
    text: string;
    left: number;
    top: number;
    width: number;
}

/** Lines narrower than this aren't worth drawing (they'd only show "…"). */
const MIN_LINE_WIDTH = 14;

function slotsFor(input: BarLabelInput, lineCount: number, fontSize: number) {
    const {width: W, height: H, cut, cutLeft, cutRight, lineHeight, glyphRatio, padding} = input;
    const glyphHeight = fontSize * glyphRatio;
    const blockTop = (H - lineCount * lineHeight) / 2;
    return Array.from({length: lineCount}, (_, i) => {
        const top = blockTop + i * lineHeight;
        const centre = top + lineHeight / 2;
        // Worst case for this line: its glyph top on the left edge, its glyph bottom on the right edge.
        const glyphTop = Math.max(0, centre - glyphHeight / 2);
        const glyphBottom = Math.min(H, centre + glyphHeight / 2);
        const left = (cutLeft ? cut * (1 - glyphTop / H) : 0) + padding;
        const right = (cutRight ? W - cut * (glyphBottom / H) : W) - padding;
        return {top, left, width: Math.max(0, right - left)};
    });
}

/** Greedy word wrap: as many whole words as fit on the first line, the rest on the second. */
function splitInTwo(name: string, firstWidth: number, measure: (t: string) => number): [string, string] | null {
    const words = name.split(/\s+/).filter(Boolean);
    let first = "";
    let used = 0;
    for (; used < words.length; used++) {
        const candidate = first ? `${first} ${words[used]}` : words[used];
        if (measure(candidate) > firstWidth) break;
        first = candidate;
    }
    if (!first) return null; // even the first word doesn't fit — keep it on one ellipsised line
    return [first, words.slice(used).join(" ")];
}

export function layoutBarLabel(input: BarLabelInput): BarLabelLayout {
    const name = input.name.trim();
    const amountLines = input.amount !== null ? 1 : 0;
    const firstWord = name.split(/\s+/)[0] ?? "";

    // Largest font whose first word fits on a line of the two-line layout.
    const sizes = input.fontSizes.length ? input.fontSizes : [12];
    const fontSize = sizes.find((size) =>
        input.measure(firstWord, size) <= slotsFor(input, amountLines + 2, size)[amountLines].width
    ) ?? sizes[sizes.length - 1];
    const measure = (text: string) => input.measure(text, fontSize);

    // Try one name line first; fall back to two when it doesn't fit.
    let slots = slotsFor(input, amountLines + 1, fontSize);
    let nameLines: string[] = [name];
    if (name && measure(name) > slots[amountLines].width) {
        const twoSlots = slotsFor(input, amountLines + 2, fontSize);
        const split = splitInTwo(name, twoSlots[amountLines].width, measure);
        if (split && split[1]) {
            slots = twoSlots;
            nameLines = split;
        }
    }

    const lines: BarLabelLine[] = [];
    if (input.amount !== null) {
        lines.push({kind: "amount", text: input.amount, ...slots[0]});
    }
    nameLines.forEach((text, i) => lines.push({kind: "name", text, ...slots[amountLines + i]}));
    const visible = lines.filter((l) => l.width >= MIN_LINE_WIDTH && l.text !== "");

    const amountFontSize = input.amountFontSize ?? fontSize * 0.875;
    const allFit = visible.length > 0 && visible.every((l) =>
        input.measure(l.text, l.kind === "amount" ? amountFontSize : fontSize) <= l.width
    );
    return {fontSize, align: allFit ? "center" : "left", lines: visible};
}

const amountFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});

/**
 * What the bar shows above the guest name: the total still due for any
 * booking that isn't paid. Paid bookings and blocked dates show nothing.
 */
export function amountDue(status: string, totalAmount: number | null | undefined): { text: string; missing: boolean } | null {
    if (status === "PAID" || status === "BLOCK" || status === "CANCELLED") return null;
    const total = Number(totalAmount ?? 0);
    if (!total || Number.isNaN(total)) return {text: "0", missing: true};
    return {text: amountFormat.format(total), missing: false};
}
