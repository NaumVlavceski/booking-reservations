import {useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode} from "react";
import {Link} from "react-router-dom";
import {MoreHorizontalIcon} from "../icons";

export type MenuItem =
    | { kind: "link"; label: ReactNode; to: string; state?: unknown; icon?: ReactNode }
    | { kind: "button"; label: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean };

interface MenuProps {
    /** Accessible name of the ⋯ button, e.g. "More actions for Lakeside Villa". */
    label: string;
    items: MenuItem[];
    /** Custom trigger content (defaults to a ⋯ icon). */
    trigger?: ReactNode;
    triggerClassName?: string;
}

/** A ⋯ button with a small action menu. Arrow keys move, Escape closes and returns focus. */
export default function Menu({label, items, trigger, triggerClassName = "icon-btn text-muted"}: MenuProps) {
    const [open, setOpen] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const menuId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!open || !buttonRef.current || !listRef.current) return;
        const below = window.innerHeight - buttonRef.current.getBoundingClientRect().bottom;
        setOpenUp(below < listRef.current.offsetHeight + 96);
        listRef.current.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;

        function onPointerDown(e: PointerEvent) {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        }

        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    function close(returnFocus = true) {
        setOpen(false);
        if (returnFocus) buttonRef.current?.focus();
    }

    function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        const entries = [...(listRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const index = entries.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            entries[(index + step + entries.length) % entries.length]?.focus();
        } else if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            entries[e.key === "Home" ? 0 : entries.length - 1]?.focus();
        } else if (e.key === "Tab") {
            close(false);
        }
    }

    const itemClass = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body font-medium outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover";

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onClick={() => setOpen((o) => !o)}
                className={triggerClassName}
            >
                {trigger ?? <MoreHorizontalIcon size={20}/>}
            </button>
            {open && (
                <div
                    ref={listRef}
                    id={menuId}
                    role="menu"
                    aria-label={label}
                    onKeyDown={onKeyDown}
                    className={`absolute right-0 z-40 min-w-52 animate-pop-in rounded-2xl border border-subtle bg-surface-raised p-1.5 shadow-popover ${
                        openUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
                    }`}
                >
                    {items.map((item, i) =>
                        item.kind === "link" ? (
                            <Link key={i} role="menuitem" tabIndex={-1} to={item.to} state={item.state} className={`${itemClass} text-fg`}
                                  onClick={() => close(false)}>
                                {item.icon && <span className="text-muted">{item.icon}</span>}
                                {item.label}
                            </Link>
                        ) : (
                            <button
                                key={i}
                                type="button"
                                role="menuitem"
                                tabIndex={-1}
                                aria-disabled={item.disabled || undefined}
                                onClick={() => {
                                    if (item.disabled) return;
                                    close(false);
                                    item.onSelect();
                                }}
                                className={`${itemClass} ${item.danger ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft" : "text-fg"} ${item.disabled ? "opacity-50" : ""}`}
                            >
                                {item.icon && <span className={item.danger ? "" : "text-muted"}>{item.icon}</span>}
                                {item.label}
                            </button>
                        ),
                    )}
                </div>
            )}
        </div>
    );
}
