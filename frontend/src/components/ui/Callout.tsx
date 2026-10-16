import type {ReactNode} from "react";
import {AlertIcon, CheckCircleIcon, InfoIcon, WarningIcon} from "../icons";

export type CalloutTone = "info" | "warning" | "danger" | "success";

const STYLE: Record<CalloutTone, { box: string; icon: ReactNode }> = {
    info: {box: "border-info-line bg-info-soft", icon: <InfoIcon className="text-info"/>},
    warning: {box: "border-warning-line bg-warning-soft", icon: <WarningIcon size={20} className="text-warning"/>},
    danger: {box: "border-danger-line bg-danger-soft", icon: <AlertIcon className="text-danger"/>},
    success: {box: "border-success-line bg-success-soft", icon: <CheckCircleIcon className="text-success"/>},
};

interface CalloutProps {
    tone?: CalloutTone;
    title?: ReactNode;
    children?: ReactNode;
    /** e.g. a "Try again" button, shown under the text. */
    action?: ReactNode;
    className?: string;
    /** "alert" for problems that appear after an action, so screen readers announce them. */
    role?: "alert" | "status";
}

/** A message box in the page flow: icon + optional bold title + text, tone by meaning. */
export default function Callout({tone = "info", title, children, action, className = "", role}: CalloutProps) {
    const style = STYLE[tone];
    return (
        <div role={role} className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-body-sm text-fg ${style.box} ${className}`}>
            <span className="mt-px shrink-0">{style.icon}</span>
            <div className="min-w-0 flex-1">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
                {action && <div className="mt-2.5">{action}</div>}
            </div>
        </div>
    );
}
