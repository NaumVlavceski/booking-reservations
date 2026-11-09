import {PLATFORM_NAME} from "./syncErrors";

interface LabelledBooking {
    guestName?: string | null;
    status: string;
    source: string;
}

// What channels put in SUMMARY when they don't share guest details: not a guest's name, so not worth showing.
const GENERIC_SUMMARY = /^(closed\s*-\s*)?not available$|^reserved$|^blocked$|^airbnb \(not available\)$/i;

export function isGenericSummary(summary: string): boolean {
    return GENERIC_SUMMARY.test(summary.trim());
}

/** The guest's real name, or "" when there is none (empty, or only a channel's placeholder text). */
export function guestNameOf(booking: LabelledBooking): string {
    const name = booking.guestName?.trim() ?? "";
    return booking.source !== "DIRECT" && isGenericSummary(name) ? "" : name;
}

/** What to call a booking on screen: the guest if we know the name, else what it is or where it came from. */
export function bookingLabel(booking: LabelledBooking): string {
    return guestNameOf(booking)
        || (booking.status === "BLOCK" ? "Blocked" : PLATFORM_NAME[booking.source] ?? "Reservation");
}
