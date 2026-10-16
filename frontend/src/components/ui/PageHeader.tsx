import type {MouseEvent, ReactNode} from "react";
import {Link} from "react-router-dom";
import {ChevronLeftIcon} from "../icons";
import SyncAlerts from "../SyncAlerts";
import {useReturnTo} from "../../lib/useReturnTo";

export interface BackTarget {
    /** Where back goes when this page was opened directly; otherwise it returns to the previous page. */
    to: string;
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
    state?: unknown;
}

interface PageHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    back?: BackTarget;
    /** Buttons on the right of the title (keep to one or two on phones). */
    actions?: ReactNode;
    /** The conflict / sync-problem chips under the header (on by default). */
    alerts?: boolean;
}

/**
 * Top of every list/detail page. Phones: a sticky 56px bar on the surface colour (back, title, actions)
 * that clears the notch. From sm up: a roomy header in the page flow.
 */
export default function PageHeader({title, description, back, actions, alerts = true}: PageHeaderProps) {
    const {goBack} = useReturnTo(back?.to ?? "/dashboard/calendar");
    function handleBack(e: MouseEvent<HTMLAnchorElement>) {
        if (back?.onClick) back.onClick(e);
        else {
            e.preventDefault();
            goBack();
        }
    }

    return (
        <div className="mb-4 sm:mb-6">
            <header className="sticky top-0 z-20 -mx-4 border-b border-subtle bg-surface pt-[env(safe-area-inset-top)] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:pt-0">
                {back && (
                    <Link
                        to={back.to}
                        state={back.state}
                        onClick={handleBack}
                        aria-label="Back"
                        className="mb-1 hidden min-h-11 items-center gap-1 rounded-xl pr-3 pl-1 text-body-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-fg sm:-ml-1 sm:inline-flex"
                    >
                        <ChevronLeftIcon size={18}/>
                        Back
                    </Link>
                )}
                <div className="flex min-h-14 items-center gap-1 px-2 sm:min-h-0 sm:items-start sm:gap-4 sm:px-0">
                    {back && (
                        <Link
                            to={back.to}
                            state={back.state}
                            onClick={handleBack}
                            aria-label="Back"
                            className="icon-btn sm:hidden"
                        >
                            <ChevronLeftIcon size={22}/>
                        </Link>
                    )}
                    <h1 className={`min-w-0 flex-1 truncate text-title-2 text-fg sm:text-title-1 sm:whitespace-normal lg:text-display ${back ? "" : "pl-2 text-title-1 sm:pl-0"}`}>
                        {title}
                    </h1>
                    {actions && <div className="flex shrink-0 items-center gap-1 pr-1 sm:gap-2 sm:pr-0">{actions}</div>}
                </div>
            </header>
            {description && <p className="mt-3 text-body-sm text-muted sm:mt-1.5 sm:max-w-2xl sm:text-body">{description}</p>}
            {alerts && <SyncAlerts className="mt-3"/>}
        </div>
    );
}
