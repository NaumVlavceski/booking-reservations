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
                <div className="mb-6 flex flex-col items-center gap-4 text-center sm:mb-8">
                    {/* White tile: the logo's artwork is drawn for a light background, in both themes. */}
                    <span className="rounded-2xl bg-white p-2.5 shadow-card ring-1 ring-black/5">
                        <AppLogo size={48}/>
                    </span>
                    <div>
                        <p className="text-overline text-subtle uppercase">RoomTrack</p>
                        <h1 className="mt-1 text-title-1 text-fg">{title}</h1>
                        {subtitle && <div className="mt-1.5 text-body-sm text-muted sm:text-body">{subtitle}</div>}
                    </div>
                </div>
                {!online && (
                    <Callout tone="warning" role="status" className="mb-4" title="You're offline">
                        Connect to the internet to continue.
                    </Callout>
                )}
                <div className="rounded-3xl border border-subtle bg-surface p-5 shadow-card sm:p-8">
                    {children}
                </div>
                {footer && <div className="mt-6 space-y-2 text-center text-body-sm text-muted">{footer}</div>}
            </div>
        </main>
    );
}
