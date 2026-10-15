export type CalendarPlatform = "BOOKING" | "AIRBNB";

export function normalizeIcsUrl(raw: string): string {
    const link = raw.trim();
    return /^webcal:\/\//i.test(link) ? "https://" + link.slice("webcal://".length) : link;
}

const AIRBNB_HOST = /^([a-z0-9-]+\.)*airbnb\.[a-z]{2,3}(\.[a-z]{2})?$/;

export function detectPlatform(raw: string): CalendarPlatform | null {
    let host: string;
    try {
        host = new URL(normalizeIcsUrl(raw)).hostname.toLowerCase();
    } catch {
        return null;
    }
    if (host === "booking.com" || host.endsWith(".booking.com")) return "BOOKING";
    if (AIRBNB_HOST.test(host)) return "AIRBNB";
    return null;
}
