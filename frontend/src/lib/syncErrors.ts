export const PLATFORM_NAME: Record<string, string> = {BOOKING: "Booking.com", AIRBNB: "Airbnb"};

export interface SyncProblem {
    /** One line saying what went wrong, in plain words. */
    title: string;
    /** What the owner can do about it. */
    advice: string;
}

const REPLACE_LINK = "Copy a fresh calendar export link from {p} and replace the old one in this room's settings.";

/**
 * Turns the raw error stored on a calendar (an HTTP status, a Java exception
 * message…) into something a property owner can act on. The raw text is still
 * shown separately under "Technical details".
 */
export function describeSyncError(raw: string | null, platform: string): SyncProblem {
    const p = PLATFORM_NAME[platform] ?? platform;
    const text = raw ?? "";
    const fill = (s: string) => s.replaceAll("{p}", p);

    if (/HTTP (404|410)/.test(text)) {
        return {title: `${p} says this calendar link no longer exists.`, advice: fill(REPLACE_LINK)};
    }
    if (/HTTP (401|403)/.test(text)) {
        return {title: `${p} refused this calendar link.`, advice: fill(REPLACE_LINK)};
    }
    if (/HTTP 5\d\d/.test(text)) {
        return {
            title: `${p} is having problems right now.`,
            advice: "This is usually temporary. We keep retrying automatically — you don't need to do anything yet.",
        };
    }
    if (/HTTP \d{3}/.test(text)) {
        return {title: `${p} didn't return the calendar.`, advice: fill(REPLACE_LINK)};
    }
    if (/not an iCal feed/i.test(text)) {
        return {
            title: "That link isn't a calendar export.",
            advice: fill("Make sure you copied the iCal / calendar export link from {p}, not the link to your listing page."),
        };
    }
    if (/size cap/i.test(text)) {
        return {title: "That calendar is unusually large.", advice: fill("Check that the link is the export for this one room on {p}.")};
    }
    if (/timed? ?out/i.test(text)) {
        return {title: `${p} didn't answer in time.`, advice: "Usually temporary. Try again in a few minutes."};
    }
    if (/PKIX|certificate|SSL|handshake/i.test(text)) {
        return {
            title: `A secure connection to ${p} couldn't be made.`,
            advice: "This is a problem on our side or with the network, not with your link. Try again later; if it keeps happening, contact support.",
        };
    }
    if (/could not be resolved|private address|valid https|Invalid feed URL/i.test(text)) {
        return {title: "This calendar link can't be reached.", advice: fill(REPLACE_LINK)};
    }
    return {title: `Couldn't sync with ${p}.`, advice: "Try again. If it keeps failing, replace the calendar link in this room's settings."};
}
