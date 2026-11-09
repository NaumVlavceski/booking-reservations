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
                className="fixed right-4 bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+1rem+var(--rt-demo-dock,0px))] z-(--rt-z-sticky) inline-flex min-h-14 items-center gap-2 rounded-card bg-primary pr-5 pl-4 text-body font-semibold text-on-primary shadow-overlay transition-[background-color,transform] duration-(--rt-dur-fast) ease-standard hover:bg-primary-hover active:scale-[0.98] active:bg-primary-pressed sm:hidden"
            >
                {icon}
                {children}
            </Link>
        </>
    );
}
