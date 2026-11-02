import type {ReactNode} from "react";
import AppLogo from "./AppLogo";
import {useOnlineStatus} from "../lib/useOnlineStatus";
import Callout from "./ui/Callout";

interface AuthLayoutProps {
    title: ReactNode;
    subtitle?: ReactNode;
    children: ReactNode;
    /** Links under the card ("Don't have an account? Register"). */
    footer?: ReactNode;
}

/** Log in / register / verify: the logo, one card, and a way to the other auth page. */
export default function AuthLayout({title, subtitle, children, footer}: AuthLayoutProps) {
    const online = useOnlineStatus();
    return (
        <main className="flex min-h-dvh flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:justify-center sm:py-12">
            <div className="w-full max-w-md">
                {/* The brand once, as a lockup; the page title does the talking. Left-aligned like the rest of the app. */}
                <div className="mb-8 flex items-center gap-3">
                    {/* White tile: the logo's artwork is drawn for a light background, in both themes. */}
                    <span className="rounded-control bg-white p-1.5 ring-1 ring-(--rt-border-subtle)">
                        <AppLogo size={36}/>
                    </span>
                    <span aria-hidden="true" className="text-title-3 font-bold text-fg">RoomTrack</span>
                </div>
                <div className="mb-5 px-1 sm:mb-6">
                    <h1 className="text-display text-fg">{title}</h1>
                    {subtitle && <div className="mt-1.5 text-body text-muted">{subtitle}</div>}
                </div>
                {!online && (
                    <Callout tone="warning" role="status" className="mb-4" title="You're offline">
                        Connect to the internet to continue.
                    </Callout>
                )}
                <div className="rounded-sheet border border-subtle bg-surface p-5 sm:p-8">
                    {children}
                </div>
                {footer && <div className="mt-6 space-y-2 px-1 text-body-sm text-muted">{footer}</div>}
            </div>
        </main>
    );
}
