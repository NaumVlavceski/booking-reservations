import type {ReactNode} from "react";
import {Link} from "react-router-dom";
import {ChevronLeftIcon} from "../components/icons";
import {useAdminShell} from "./AdminContext";
import {AdminChip, CountdownPill} from "./adminUi";

/**
 * Phones: a sticky top bar (back arrow or title, ADMIN chip, countdown pill, optional actions such as a ⋮ menu).
 * Desktop: a large title with the actions on the right; the countdown lives in the sidebar there.
 */
export default function AdminPageHeader({title, mobileTitle, back, badge, actions, mobileActions}: {
    title: ReactNode;
    /** Shorter title for the phone bar (e.g. "Owner" on an owner's page). */
    mobileTitle?: ReactNode;
    back?: { to: string; label: string };
    /** Next to the desktop title (e.g. a Needs help chip). */
    badge?: ReactNode;
    actions?: ReactNode;
    mobileActions?: ReactNode;
}) {
    const {secondsLeft} = useAdminShell();
    return (
        <>
            <header className="sticky top-0 z-10 -mx-4 mb-3 flex min-h-14 items-center gap-2 bg-canvas/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
                {back && (
                    <Link to={back.to} className="icon-btn -ml-2 size-11 text-fg" aria-label={`Back to ${back.label}`}>
                        <ChevronLeftIcon size={22}/>
                    </Link>
                )}
                <h1 className={`min-w-0 flex-1 truncate text-fg ${back ? "text-title-2" : "text-title-1"}`}>{mobileTitle ?? title}</h1>
                {!back && <AdminChip/>}
                <CountdownPill seconds={secondsLeft}/>
                {mobileActions}
            </header>
            <header className="mb-6 hidden items-center gap-4 lg:flex">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    {back && (
                        <Link to={back.to} className="flex items-center gap-1 text-body font-medium text-muted hover:text-fg">
                            <ChevronLeftIcon size={18}/>{back.label}
                        </Link>
                    )}
                    <h1 className="truncate text-display text-fg">{title}</h1>
                    {badge}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            </header>
        </>
    );
}
