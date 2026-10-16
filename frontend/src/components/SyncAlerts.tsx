import {Link, useLocation} from "react-router-dom";
import {useSyncAlerts} from "../lib/useSyncAlerts";
import {useOnlineStatus} from "../lib/useOnlineStatus";
import {AlertIcon, ChevronRightIcon, SyncIcon, WifiOffIcon} from "./icons";

const chip = "relative inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border py-1 pr-2 pl-3 text-body-sm font-semibold whitespace-nowrap transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']";

/**
 * One compact strip of warnings: being offline, booking conflicts, sync problems. Each chip links to the
 * page that explains it, and is hidden while you're already on that page. Always one line (scrolls sideways
 * if it must), so pages can reserve its height.
 */
export default function SyncAlerts({className = ""}: { className?: string }) {
    const {conflictCount, failingCount} = useSyncAlerts();
    const online = useOnlineStatus();
    const {pathname} = useLocation();
    const showConflicts = conflictCount > 0 && pathname !== "/dashboard/conflicts";
    const showFailing = failingCount > 0 && pathname !== "/dashboard/sync-health";
    if (online && !showConflicts && !showFailing) return null;

    return (
        <div className={`flex h-12 items-center gap-2 overflow-x-auto [scrollbar-width:none] ${className}`}>
            {!online && (
                <p role="status" className={`${chip} border-default bg-surface-sunken pr-3 text-fg`}>
                    <WifiOffIcon size={15}/>
                    Offline — changes can't be saved
                </p>
            )}
            {showConflicts && (
                <Link to="/dashboard/conflicts" className={`${chip} border-danger-line bg-danger-soft text-danger hover:brightness-95`}>
                    <AlertIcon size={15}/>
                    {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"}
                    <ChevronRightIcon size={15}/>
                </Link>
            )}
            {showFailing && (
                <Link to="/dashboard/sync-health" className={`${chip} border-warning-line bg-warning-soft text-warning hover:brightness-95`}>
                    <SyncIcon size={15}/>
                    {failingCount} {failingCount === 1 ? "sync problem" : "sync problems"}
                    <ChevronRightIcon size={15}/>
                </Link>
            )}
        </div>
    );
}
