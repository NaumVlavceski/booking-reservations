import {Link, useLocation} from "react-router-dom";
import {useSyncAlerts} from "../lib/useSyncAlerts";
import {AlertIcon, ChevronRightIcon, SyncIcon} from "./icons";

/**
 * One compact strip of warnings at the top of the dashboard. Each chip links
 * to the page that explains it, and is hidden while you're already on that page.
 */
export default function SyncAlerts() {
    const {conflictCount, failingCount} = useSyncAlerts();
    const {pathname} = useLocation();
    const showConflicts = conflictCount > 0 && pathname !== "/dashboard/conflicts";
    const showFailing = failingCount > 0 && pathname !== "/dashboard/sync-health";
    if (!showConflicts && !showFailing) return null;

    return (
        <div className="flex gap-2 px-4 pt-3 pb-1 sm:px-0 sm:pt-0 sm:pb-4">
            {showConflicts && (
                <Link
                    to="/dashboard/conflicts"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 py-1.5 pr-2 pl-3 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100"
                >
                    <AlertIcon size={15}/>
                    {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"}
                    <ChevronRightIcon size={15} className="text-red-400"/>
                </Link>
            )}
            {showFailing && (
                <Link
                    to="/dashboard/sync-health"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 py-1.5 pr-2 pl-3 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                >
                    <SyncIcon size={15}/>
                    {failingCount} {failingCount === 1 ? "sync problem" : "sync problems"}
                    <ChevronRightIcon size={15} className="text-amber-500"/>
                </Link>
            )}
        </div>
    );
}
