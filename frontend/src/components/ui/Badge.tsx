import type {ReactNode} from "react";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const TONE: Record<BadgeTone, string> = {
    success: "border-success-line bg-success-soft text-success",
    warning: "border-warning-line bg-warning-soft text-warning",
    danger: "border-danger-line bg-danger-soft text-danger",
    info: "border-info-line bg-info-soft text-info",
    neutral: "border-default bg-surface-sunken text-muted",
    primary: "border-primary-line bg-primary-soft text-on-primary-soft",
};

/** A small status pill. Always carries text (and usually an icon), never colour alone. */
export default function Badge({tone = "neutral", icon, children, className = ""}: {
    tone?: BadgeTone;
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-caption font-semibold whitespace-nowrap ${TONE[tone]} ${icon ? "pl-2" : ""} ${className}`}>
            {icon}
            {children}
        </span>
    );
}

/** Red count bubble (alerts on navigation). The number is decorative; pair it with sr-only text. */
export function CountBubble({count, tone = "danger", className = ""}: { count: number; tone?: "danger" | "warning"; className?: string }) {
    if (count <= 0) return null;
    return (
        <span
            aria-hidden="true"
            className={`inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[0.6875rem] leading-none font-bold ring-2 ring-[var(--rt-surface)] ${
                tone === "danger" ? "bg-danger-solid text-on-danger-solid" : "bg-warning-solid text-on-warning-solid"
            } ${className}`}
        >
            {count > 99 ? "99+" : count}
        </span>
    );
}
