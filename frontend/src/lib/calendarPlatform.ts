export type CalendarPlatform = "BOOKING";

export function normalizeIcsUrl(raw: string): string {
    const link = raw.trim();
    return /^webcal:\/\//i.test(link) ? "https://" + link.slice("webcal://".length) : link;
}

export function detectPlatform(raw: string): CalendarPlatform | null {
    let host: string;
    try {
        host = new URL(normalizeIcsUrl(raw)).hostname.toLowerCase();
    } catch {
        return null;
    }
    if (host === "booking.com" || host.endsWith(".booking.com")) return "BOOKING";
    return null;
}
