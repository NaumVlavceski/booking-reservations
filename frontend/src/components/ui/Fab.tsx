import type {ReactNode} from "react";
import {Link} from "react-router-dom";

/**
 * Phones only: the page's main action as a floating button just above the tab bar, where the thumb is.
 * From sm up the same action sits in the page header instead.
 */
export default function Fab({to, state, icon, children}: { to: string; state?: unknown; icon: ReactNode; children: ReactNode }) {
    return (
        <>
            {/* Room under the last row so the button never covers it. */}
            <div aria-hidden="true" className="h-20 sm:hidden"/>
            <Link
                to={to}
                state={state}
                className="fixed right-4 bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+1rem)] z-20 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-primary pr-5 pl-4 text-body font-semibold text-on-primary shadow-overlay transition-colors hover:bg-primary-hover active:bg-primary-pressed sm:hidden"
            >
                {icon}
                {children}
            </Link>
        </>
    );
}
