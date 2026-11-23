// Small shared pieces of the admin panel: status chips (always icon + word, never colour alone), relative times
// with the exact time on hover or tap, the ADMIN chip and the session countdown pill.
import {useState, type ReactNode} from "react";
import Badge, {type BadgeTone} from "../components/ui/Badge";
import {AlertIcon, CheckIcon, InfoIcon, WarningIcon} from "../components/icons";
import type {ReasonCode} from "./adminApi";
import {absolute, mmss, reasonLabel, timeAgo} from "./adminFormat";

export function ClockIcon({size = 14}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
        </svg>
    );
}

export function MailIcon({size = 14}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-10 6L2 7"/>
        </svg>
    );
}

export function GridIcon({size = 22}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
    );
}

export function PeopleIcon({size = 22}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
    );
}

export function ListIcon({size = 20}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
    );
}

// ---------- time ----------

/** A relative time; hover shows the exact time, a tap (or long-press) switches between the two. */
export function RelativeTime({iso, prefix = "", className = ""}: { iso: string | null; prefix?: string; className?: string }) {
    const [exact, setExact] = useState(false);
    if (!iso) return <span className={className}>{prefix}never</span>;
    return (
        <time dateTime={iso} title={absolute(iso)} className={`cursor-help ${className}`}
              onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setExact((v) => !v);
              }}
              onContextMenu={(e) => {
                  e.preventDefault();
                  setExact(true);
              }}>
            {prefix}{exact ? absolute(iso) : timeAgo(iso)}
        </time>
    );
}

// ---------- chips ----------

const REASON_STYLE: Record<ReasonCode, { tone: BadgeTone; icon: ReactNode }> = {
    SYNC_FAILING: {tone: "danger", icon: <WarningIcon size={12}/>},
    OPEN_CONFLICTS: {tone: "warning", icon: <WarningIcon size={12}/>},
    EMAIL_BOUNCED: {tone: "danger", icon: <MailIcon size={12}/>},
    UNVERIFIED_24H: {tone: "warning", icon: <MailIcon size={12}/>},
    STUCK_ONBOARDING: {tone: "warning", icon: <ClockIcon size={12}/>},
    INACTIVE_14D: {tone: "neutral", icon: <ClockIcon size={12}/>},
};

export function ReasonChip({code, row, label}: {
    code: ReasonCode;
    row?: { registeredAt: string | null; lastSeenAt: string | null };
    label?: string;
}) {
    const s = REASON_STYLE[code];
    return <Badge tone={s.tone} icon={s.icon}>{label ?? reasonLabel(code, row)}</Badge>;
}

export function OkChip({children = "OK"}: { children?: ReactNode }) {
    return <Badge tone="success" icon={<CheckIcon size={12}/>}>{children}</Badge>;
}

export function SyncChip({sync}: { sync: "NONE" | "OK" | "FAILING" }) {
    if (sync === "FAILING") return <Badge tone="danger" icon={<WarningIcon size={12}/>}>Failing</Badge>;
    if (sync === "OK") return <OkChip/>;
    return <Badge tone="neutral" icon={<InfoIcon size={12}/>}>None</Badge>;
}

/** Email delivery state. */
export function EmailStatusChip({status}: { status: string }) {
    switch (status) {
        case "DELIVERED": return <OkChip>Delivered</OkChip>;
        case "SENT": return <Badge tone="info" icon={<CheckIcon size={12}/>}>Sent</Badge>;
        case "QUEUED": return <Badge tone="neutral" icon={<ClockIcon size={12}/>}>Queued</Badge>;
        case "BOUNCED": return <Badge tone="danger" icon={<AlertIcon size={12}/>}>Bounced</Badge>;
        case "COMPLAINED": return <Badge tone="danger" icon={<AlertIcon size={12}/>}>Spam report</Badge>;
        default: return <Badge tone="danger" icon={<AlertIcon size={12}/>}>Failed</Badge>;
    }
}

// ---------- header pieces ----------

export function AdminChip() {
    return (
        <span className="inline-flex h-6 items-center rounded-full border border-primary px-2 text-micro font-bold tracking-wider text-primary">
            ADMIN
        </span>
    );
}

export function CountdownPill({seconds}: { seconds: number }) {
    const low = seconds <= 60;
    return (
        <span role="timer" aria-label={`Admin session ends in ${mmss(seconds)}`}
              className={`num inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-body-sm font-bold ${
                  low ? "bg-warning-soft text-warning" : "bg-primary-soft text-on-primary-soft"
              }`}>
            <ClockIcon size={14}/>
            {mmss(seconds)}
        </span>
    );
}

/** Initials on a neutral tile, like the owner app's Avatar but a little larger for owner cards. */
export function OwnerAvatar({name, email, size = "md"}: { name: string | null; email: string; size?: "md" | "lg" }) {
    const words = (name?.trim() || email).split(/\s+/);
    const initials = ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
    return (
        <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-control bg-tile font-bold text-on-tile ${
            size === "lg" ? "size-14 text-title-3" : "size-11 text-body-sm"
        }`}>
            {initials}
        </span>
    );
}
