import type {ReactNode} from "react";
import {AlertIcon, WifiOffIcon} from "../icons";
import Button from "./Button";
import Card from "./Card";

/** A grey placeholder block with a gentle pulse. Size it like the content it stands in for. */
export function Skeleton({className = ""}: { className?: string }) {
    return <span aria-hidden="true" className={`skeleton block ${className}`}/>;
}

/** Stand-in for a list of cards/rows while it loads, so nothing jumps when the data arrives. */
export function ListSkeleton({rows = 3, label}: { rows?: number; label: string }) {
    return (
        <div role="status" aria-live="polite" className="stack-list">
            <span className="sr-only">{label}</span>
            {Array.from({length: rows}, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                    <Skeleton className="size-10 shrink-0 rounded-xl"/>
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-2/5"/>
                        <Skeleton className="h-3 w-3/5"/>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Stand-in for a form while the record loads. */
export function FormSkeleton({label, sections = 2}: { label: string; sections?: number }) {
    return (
        <div role="status" aria-live="polite" className="space-y-4">
            <span className="sr-only">{label}</span>
            {Array.from({length: sections}, (_, i) => (
                <Card key={i} className="space-y-4">
                    <Skeleton className="h-4 w-1/3"/>
                    <Skeleton className="h-12 w-full rounded-xl"/>
                    <Skeleton className="h-12 w-full rounded-xl"/>
                </Card>
            ))}
        </div>
    );
}

interface EmptyStateProps {
    icon?: ReactNode;
    title: ReactNode;
    children?: ReactNode;
    /** The one thing to do next. */
    action?: ReactNode;
    className?: string;
}

/** Nothing to show yet: what this place is for, and the one action that fills it. */
export function EmptyState({icon, title, children, action, className = ""}: EmptyStateProps) {
    return (
        <Card className={`flex flex-col items-center gap-2 px-6 py-10 text-center sm:py-14 ${className}`}>
            {icon && (
                <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-on-primary-soft">
                    {icon}
                </span>
            )}
            <h2 className="text-title-3 text-fg">{title}</h2>
            {children && <div className="max-w-sm text-body-sm text-muted">{children}</div>}
            {action && <div className="mt-4">{action}</div>}
        </Card>
    );
}

interface ErrorStateProps {
    title?: ReactNode;
    children?: ReactNode;
    onRetry?: () => void;
    retrying?: boolean;
    className?: string;
}

/** Something failed to load: say so plainly and offer to try again. */
export function ErrorState({title = "Couldn't load this", children, onRetry, retrying = false, className = ""}: ErrorStateProps) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return (
        <Card className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${className}`}>
            <span aria-hidden="true" className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                {offline ? <WifiOffIcon size={22}/> : <AlertIcon size={22}/>}
            </span>
            <div role="alert">
                <h2 className="text-title-3 text-fg">{title}</h2>
                <div className="mt-2 max-w-sm text-body-sm text-muted">
                    {offline ? "You're offline. Check your connection, then try again." : children}
                </div>
            </div>
            {onRetry && (
                <Button variant="secondary" className="mt-4" onClick={onRetry} loading={retrying} loadingLabel="Trying again…">
                    Try again
                </Button>
            )}
        </Card>
    );
}
