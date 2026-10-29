import {useEffect, useId, useRef, useState, type ReactNode, type RefObject} from "react";
import {createPortal} from "react-dom";
import {CloseIcon} from "../icons";

interface SheetProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    /** Visually hide the title (it still names the dialog). */
    titleHidden?: boolean;
    description?: ReactNode;
    /** Shown above the title (e.g. a round warning icon on confirmations). */
    icon?: ReactNode;
    children?: ReactNode;
    /** "alertdialog" for confirmations that interrupt. */
    role?: "dialog" | "alertdialog";
    /** Element to focus when opening; defaults to the first focusable element. */
    initialFocusRef?: RefObject<HTMLElement | null>;
    /** While false, Escape, the backdrop and the close button do nothing (e.g. a request is running). */
    dismissible?: boolean;
    /** Show a close (×) button in the header (top-right corner when the title is hidden). */
    showClose?: boolean;
    closeLabel?: string;
    /** Widest the dialog gets from `sm` up. */
    size?: "sm" | "md";
    /** Pinned under the content (buttons). */
    footer?: ReactNode;
}

/** Matches the exit animations (--rt-dur-base). */
const EXIT_MS = 200;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal surface: a bottom sheet on phones (thumb reach), a centred dialog from `sm` up.
 * Traps focus, closes on Escape / backdrop, returns focus to whatever opened it, and locks page scroll.
 */
export default function Sheet({
    open, onClose, title, titleHidden = false, description, icon, children, role = "dialog", initialFocusRef,
    dismissible = true, showClose = false, closeLabel = "Close", size = "sm", footer,
}: SheetProps) {
    const titleId = useId();
    const descriptionId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const dismissibleRef = useRef(dismissible);
    // Stay mounted while the closing animation plays.
    const [rendered, setRendered] = useState(open);
    if (open && !rendered) setRendered(true);
    const closing = rendered && !open;

    useEffect(() => {
        if (open || !rendered) return;
        const t = window.setTimeout(() => setRendered(false), EXIT_MS);
        return () => window.clearTimeout(t);
    }, [open, rendered]);

    useEffect(() => {
        onCloseRef.current = onClose;
        dismissibleRef.current = dismissible;
    });

    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        const target = initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
        target?.focus();

        const root = document.documentElement;
        const previousOverflow = root.style.overflow;
        root.style.overflow = "hidden";

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.stopPropagation();
                if (dismissibleRef.current) onCloseRef.current();
                return;
            }
            if (e.key !== "Tab" || !panel) return;
            const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            root.style.overflow = previousOverflow;
            if (opener && document.contains(opener)) opener.focus();
        };
        // initialFocusRef is read once per opening on purpose.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!rendered) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6 ${closing ? "pointer-events-none" : ""}`}>
            <div
                aria-hidden="true"
                className={`absolute inset-0 bg-scrim ${closing ? "animate-fade-out" : "animate-fade-in"}`}
                onClick={() => dismissible && onClose()}
            />
            <div
                ref={panelRef}
                role={role}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                tabIndex={-1}
                className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-subtle bg-surface-raised shadow-overlay outline-none sm:max-h-[85dvh] sm:rounded-3xl ${
                    closing ? "animate-sheet-out sm:animate-pop-out" : "animate-sheet-in sm:animate-pop-in"
                } ${
                    size === "md" ? "sm:max-w-lg" : "sm:max-w-md"
                }`}
            >
                <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[var(--rt-border)] sm:hidden"/>
                <div className={`flex items-start gap-3 px-5 pt-3 sm:px-6 sm:pt-6 ${titleHidden && !showClose ? "sr-only" : ""} ${titleHidden && showClose ? "absolute top-1 right-1 z-10 p-0 sm:p-0" : ""}`}>
                    <div className={`min-w-0 flex-1 ${titleHidden ? "sr-only" : ""}`}>
                        {icon && <div className="mb-3">{icon}</div>}
                        <h2 id={titleId} className="text-title-2 text-fg">{title}</h2>
                        {description && <div id={descriptionId} className="mt-1 text-body-sm text-muted">{description}</div>}
                    </div>
                    {showClose && (
                        <button type="button" onClick={onClose} disabled={!dismissible} aria-label={closeLabel}
                                className={`icon-btn text-muted ${titleHidden ? "" : "-mt-1.5 -mr-2"}`}>
                            <CloseIcon size={20}/>
                        </button>
                    )}
                </div>
                {children ? (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
                        {children}
                    </div>
                ) : <div className="h-4 shrink-0"/>}
                {footer && (
                    <div className="shrink-0 border-t border-subtle px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6 sm:pb-5">
                        {footer}
                    </div>
                )}
                {!footer && <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)] shrink-0 sm:hidden"/>}
            </div>
        </div>,
        document.body,
    );
}
