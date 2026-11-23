import type {AuditEntry} from "./adminApi";

/** One readable line per audit entry. Entries carry ids and counts only; the owner's current name is joined in. */
export function auditText(a: AuditEntry): string {
    const who = a.targetName || (a.targetUserId ? "a deleted owner" : "");
    switch (a.action) {
        case "STEPUP_CODE_REQUESTED": return "Admin code requested";
        case "STEPUP_FAILED": return "Wrong admin code entered";
        case "STEPUP_LOCKED": return "Admin code locked for 15 minutes";
        case "SESSION_STARTED": return "Admin session started";
        case "SESSION_EXTENDED": return "Admin session extended";
        case "SESSION_ENDED": return "Logged out of Admin";
        case "OVERVIEW_VIEWED": return "Viewed the overview";
        case "OWNERS_LISTED": return "Viewed the owner list";
        case "OWNER_VIEWED": return `Viewed owner ${who}`;
        case "RESERVATIONS_VIEWED": return `Viewed reservations of ${who}`;
        case "CALENDARS_VIEWED": return `Viewed calendars of ${who}`;
        case "EMAILS_VIEWED": return `Viewed emails of ${who}`;
        case "EMAIL_BODY_VIEWED": return `Opened a sent email to ${who}`;
        case "NOTES_VIEWED": return `Viewed notes about ${who}`;
        case "NOTE_CREATED": return `Added a note about ${who}`;
        case "NOTE_UPDATED": return `Changed a note about ${who}`;
        case "NOTE_DELETED": return `Deleted a note about ${who}`;
        case "FOLLOW_UPS_VIEWED": return "Viewed reminders";
        case "AUDIT_LOG_VIEWED": return "Viewed the audit log";
        case "SYSTEM_VIEWED": return "Viewed system status";
        case "EMAIL_SENT": return who ? `Sent an email to ${who}` : "Sent an email";
        case "EMAIL_SEND_FAILED": return who ? `Email to ${who} failed` : "An email failed to send";
        case "DELETION_SUMMARY_VIEWED": return `Opened Delete owner for ${who}`;
        case "OWNER_DELETED": {
            const r = Number(a.details?.reservations ?? 0);
            return `Deleted an owner (${r} reservation${r === 1 ? "" : "s"})`;
        }
        default: return a.action.toLowerCase().replace(/_/g, " ");
    }
}
