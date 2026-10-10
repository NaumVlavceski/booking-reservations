import {format, isSameMonth, isSameYear} from "date-fns";

/** "yyyy-MM-dd" via new Date() is UTC midnight — parse as local to avoid off-by-one days. */
export function parseLocalDate(value: string): Date {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
}

/**
 * A stay as people say it: "14–17 Oct", "28 Oct – 2 Nov", and the year only
 * when it isn't the current one ("28 Dec 2026 – 3 Jan 2027").
 */
export function formatStay(checkIn: string, checkOut: string, now: Date = new Date()): string {
    const from = parseLocalDate(checkIn);
    const to = parseLocalDate(checkOut);
    const showYear = !isSameYear(from, now) || !isSameYear(to, now);
    if (isSameMonth(from, to)) {
        return `${format(from, "d")}–${format(to, showYear ? "d MMM yyyy" : "d MMM")}`;
    }
    if (isSameYear(from, to)) {
        return `${format(from, "d MMM")} – ${format(to, showYear ? "d MMM yyyy" : "d MMM")}`;
    }
    return `${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")}`;
}

/** With weekdays, for when the exact days matter: "Wed 14 Oct – Sat 17 Oct" (year added if not this year). */
export function formatStayDays(checkIn: string, checkOut: string, now: Date = new Date()): string {
    const from = parseLocalDate(checkIn);
    const to = parseLocalDate(checkOut);
    const pattern = isSameYear(from, now) && isSameYear(to, now) ? "EEE d MMM" : "EEE d MMM yyyy";
    return `${format(from, pattern)} – ${format(to, pattern)}`;
}

/** "today, 19:56", "yesterday, 08:10", "3 Oct, 14:00" — or "never". Lower-case so it reads naturally mid-sentence. */
export function formatWhen(iso: string | null, now: Date = new Date()): string {
    if (!iso) return "never";
    const d = new Date(iso);
    const time = format(d, "HH:mm");
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return `today, ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `yesterday, ${time}`;
    return `${format(d, isSameYear(d, now) ? "d MMM" : "d MMM yyyy")}, ${time}`;
}
