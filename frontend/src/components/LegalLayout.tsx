import {useEffect, type ReactNode} from "react";
import {Link, useLocation} from "react-router-dom";
import AppLogo from "./AppLogo";
import {ChevronLeftIcon} from "./icons";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {versionDate} from "../legal/versions";

interface LegalLayoutProps {
    title: string;
    version: string;
    /** One or two sentences under the title: what this document is about. */
    summary: ReactNode;
    children: ReactNode;
}

/**
 * Privacy Policy and Terms: public pages (no sign-in needed), readable on a phone, in both themes. Back goes to the
 * app when signed in, to the log-in page otherwise; each document links to the other.
 */
export default function LegalLayout({title, version, summary, children}: LegalLayoutProps) {
    const signedIn = Boolean(tokenStorage.get());
    const back = signedIn ? {to: "/dashboard/calendar", label: "Back to RoomTrack"} : {to: "/login", label: "Back to log in"};
    const {hash, pathname} = useLocation();

    // A link such as /privacy#security lands on that section; a plain link starts at the top.
    useEffect(() => {
        const id = hash.slice(1);
        if (id) document.getElementById(id)?.scrollIntoView({block: "start"});
        else window.scrollTo(0, 0);
    }, [hash, pathname]);

    return (
        <main className="min-h-dvh px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)] sm:px-6 sm:py-12">
            <div className="mx-auto w-full max-w-3xl">
                <div className="flex items-center justify-between gap-3">
                    <Link to={back.to} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl pr-3 pl-1 text-body-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-fg">
                        <ChevronLeftIcon size={18}/>
                        {back.label}
                    </Link>
                    {/* White tile: the logo's artwork is drawn for a light background, in both themes. */}
                    <span className="rounded-xl bg-white p-1.5 shadow-card ring-1 ring-black/5">
                        <AppLogo size={28}/>
                    </span>
                </div>

                <header className="mt-6 sm:mt-8">
                    <p className="text-overline text-subtle uppercase">RoomTrack</p>
                    <h1 className="mt-1 text-title-1 text-fg sm:text-display">{title}</h1>
                    <p className="mt-2 text-body-sm text-subtle">
                        Last updated {versionDate(version)} <span aria-hidden="true">·</span> Version {version}
                    </p>
                    <div className="mt-4 text-body text-muted">{summary}</div>
                </header>

                <article className="mt-8 rounded-3xl border border-subtle bg-surface p-5 shadow-card sm:p-8">
                    <div className="space-y-8">{children}</div>
                </article>

                <nav aria-label="Legal" className="mt-6 flex flex-wrap justify-center gap-x-6 text-body-sm text-muted">
                    <Link to="/privacy" className="link inline-flex min-h-11 items-center">Privacy Policy</Link>
                    <Link to="/terms" className="link inline-flex min-h-11 items-center">Terms of Service</Link>
                </nav>
            </div>
        </main>
    );
}

/** One numbered part of a legal document. */
export function LegalSection({id, title, children}: { id: string; title: string; children: ReactNode }) {
    return (
        <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-3">
            <h2 id={`${id}-title`} className="text-title-2 text-fg">{title}</h2>
            <div className="space-y-3 text-body-sm leading-6 text-muted sm:text-body sm:leading-7">{children}</div>
        </section>
    );
}

/** Something the operator still has to fill in before launch, e.g. [CONTACT EMAIL]. Highlighted so it can't be missed. */
export function Placeholder({children}: { children: string }) {
    return <mark className="rounded bg-warning-soft px-1 font-semibold text-warning">[{children}]</mark>;
}

/** A plain bulleted list in legal text. */
export function LegalList({children}: { children: ReactNode }) {
    return <ul className="list-disc space-y-1.5 pl-5 marker:text-subtle">{children}</ul>;
}
