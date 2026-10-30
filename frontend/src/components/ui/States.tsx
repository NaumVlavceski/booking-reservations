import {useEffect, useState, type CSSProperties, type ReactNode} from "react";
import {AlertIcon, WifiOffIcon} from "../icons";
import Button, {ButtonLink} from "./Button";
import Callout from "./Callout";
import Card from "./Card";
import {errorKind, errorReason} from "../../lib/errors";

const SLOW_LOAD_MS = 8000;

/** A grey placeholder block with a gentle pulse. Size it like the content it stands in for. */
export function Skeleton({className = "", style}: { className?: string; style?: CSSProperties }) {
    return <span aria-hidden="true" className={`skeleton block ${className}`} style={style}/>;
}

/** Appears under a loading placeholder once loading takes unusually long, so a slow connection doesn't look frozen. */
export function SlowLoadingHint({className = ""}: { className?: string }) {
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
        return () => window.clearTimeout(timer);
    }, []);
    if (!slow) return null;
    return <p className={`px-4 py-3 text-center text-body-sm text-muted ${className}`}>Still loading… This is taking longer than usual.</p>;
}

/** Stand-in for a list of cards/rows while it loads, so nothing jumps when the data arrives. */
export function ListSkeleton({rows = 3, label}: { rows?: number; label: string }) {
    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">{label}</span>
            <div className="stack-list">
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
            <SlowLoadingHint/>
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
            <SlowLoadingHint/>
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
    /** What went wrong; its plain-words reason is shown unless `children` says something else. */
    error?: unknown;
    children?: ReactNode;
    onRetry?: () => void;
    retrying?: boolean;
    /** Instead of "Try again", when trying again can't help (e.g. it was deleted). */
    action?: ReactNode;
    className?: string;
}

/** Something failed to load: say so plainly and offer to try again. */
export function ErrorState({title = "Couldn't load this", error, children, onRetry, retrying = false, action, className = ""}: ErrorStateProps) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return (
        <Card className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${className}`}>
            <span aria-hidden="true" className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                {offline ? <WifiOffIcon size={22}/> : <AlertIcon size={22}/>}
            </span>
            <div role="alert">
                <h2 className="text-title-3 text-fg">{title}</h2>
                <div className="mt-2 max-w-sm text-body-sm text-muted">
                    {offline ? "You're offline. Check your connection, then try again." : children ?? (error !== undefined && errorReason(error))}
                </div>
            </div>
            {onRetry && (
                <Button variant="secondary" className="mt-4" onClick={onRetry} loading={retrying} loadingLabel="Trying again…">
                    Try again
                </Button>
            )}
            {!onRetry && action && <div className="mt-4">{action}</div>}
        </Card>
    );
}

/** Data is on screen but refreshing it failed: say so, keep the data. */
export function RefreshFailed({error, onRetry, retrying = false, className = ""}: {
    error: unknown;
    onRetry: () => void;
    retrying?: boolean;
    className?: string;
}) {
    return (
        <Callout tone="warning" role="status" title="Couldn't refresh" className={className}
                 action={<Button variant="secondary" size="sm" onClick={onRetry} loading={retrying} loadingLabel="Trying again…">Try again</Button>}>
            What you see may be out of date. {errorReason(error)}
        </Callout>
    );
}

/** The record a page shows or edits couldn't be loaded: gone (going back is the way out) or failed (try again). */
export function RecordLoadError({error, what, onRetry, retrying, backTo}: {
    error: unknown;
    /** "property", "room", "booking" */
    what: string;
    onRetry: () => void;
    retrying?: boolean;
    backTo: string;
}) {
    if (errorKind(error) === "notFound") {
        return (
            <ErrorState title={`We couldn't find this ${what}`}
                        action={<ButtonLink to={backTo} variant="secondary">Go back</ButtonLink>}>
                It may have been deleted.
            </ErrorState>
        );
    }
    return <ErrorState title={`Couldn't load this ${what}`} error={error} onRetry={onRetry} retrying={retrying}/>;
}
