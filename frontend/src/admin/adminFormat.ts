// Plain helpers of the admin panel (times, labels): kept apart from adminUi.tsx so that file only exports components.
import {format} from "date-fns";
import type {ReasonCode} from "./adminApi";

// ---------- time ----------

export function daysSince(iso: string | null, now = Date.now()): number | null {
    if (!iso) return null;
    return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/** "just now", "5 min ago", "2 hours ago", "yesterday", "3 days ago", "12 Nov 2026". */
export function timeAgo(iso: string | null, now = Date.now()): string {
    if (!iso) return "never";
    const diff = now - new Date(iso).getTime();
    const min = Math.round(diff / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const hours = Math.round(diff / 3_600_000);
    if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    const days = Math.floor(diff / 86_400_000);
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    return format(new Date(iso), "d MMM yyyy");
}

export function absolute(iso: string): string {
    return format(new Date(iso), "d MMM yyyy, HH:mm");
}

export function shortDate(iso: string | null): string {
    return iso ? format(new Date(iso), "d MMM yyyy") : "—";
}

// ---------- labels ----------

export function reasonLabel(code: ReasonCode, row?: { registeredAt: string | null; lastSeenAt: string | null }): string {
    const sinceRegistered = row ? daysSince(row.registeredAt) : null;
    switch (code) {
        case "SYNC_FAILING": return "Sync failing";
        case "OPEN_CONFLICTS": return "Open conflict";
        case "EMAIL_BOUNCED": return "Email bounced";
        case "UNVERIFIED_24H": return sinceRegistered != null && sinceRegistered >= 1 ? `Email unverified ${sinceRegistered} d` : "Email unverified";
        case "STUCK_ONBOARDING": return sinceRegistered != null ? `No setup after ${sinceRegistered} d` : "No setup";
        case "INACTIVE_14D": {
            const d = row ? daysSince(row.lastSeenAt ?? row.registeredAt) : null;
            return d != null ? `Inactive ${d} d` : "Inactive";
        }
    }
}

const EMAIL_TYPES: Record<string, string> = {
    VERIFY_EMAIL: "Verification",
    PASSWORD_RESET: "Password reset",
    PASSWORD_CHANGED: "Password changed",
    ALREADY_REGISTERED: "Already registered",
    TEST: "Test email",
    EXTERNAL_RESERVATION_IMPORTED: "New booking",
    EXTERNAL_RESERVATION_CANCELLED: "Cancelled booking",
    EXTERNAL_RESERVATION_MODIFIED: "Changed booking",
    CALENDAR_SYNC_FAILING: "System alert",
    BOOKING_CONFLICT: "Conflict alert",
    BOOKING_CONFLICT_CHANGED: "Conflict alert",
    ADMIN_STEP_UP: "Admin code",
    ADMIN_MESSAGE: "Sent by you",
};

export function emailTypeLabel(type: string): string {
    return EMAIL_TYPES[type] ?? "Email";
}

export function platformLabel(platform: string | null): string {
    return platform === "BOOKING" || platform === "Booking.com" ? "Booking.com" : platform ? "Imported" : "Manual";
}

export function mmss(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
