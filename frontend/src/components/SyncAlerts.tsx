import {Link, useLocation} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {format, isToday} from "date-fns";
import {useSyncAlerts} from "../lib/useSyncAlerts";
import {useOnlineStatus} from "../lib/useOnlineStatus";
import {useConnected} from "../lib/apiReachability";
import {allReservationsQuery} from "../lib/api/reservations";
import {AlertIcon, ChevronRightIcon, SyncIcon, WifiOffIcon} from "./icons";

const chip = "relative inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border py-1 pr-2 pl-3 text-body-sm font-semibold whitespace-nowrap transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']";

/**
 * One compact strip of warnings: being offline (the calendar is then a saved copy), booking conflicts, sync problems. Each chip links to the
 * page that explains it, and is hidden while you're already on that page. Always one line (scrolls sideways
 * if it must), so pages can reserve its height.
 */
export default function SyncAlerts({className = ""}: { className?: string }) {
    const {conflictCount, failingCount} = useSyncAlerts();
    const online = useOnlineStatus();
    const connected = useConnected();
    // When the bookings on screen were last loaded from the server.
    const {dataUpdatedAt} = useQuery(allReservationsQuery);
    const {pathname} = useLocation();
    const showConflicts = conflictCount > 0 && pathname !== "/dashboard/conflicts";
    const showFailing = failingCount > 0 && pathname !== "/dashboard/sync-health";
    if (connected && !showConflicts && !showFailing) return null;

    return (
        <div className={`flex h-12 items-center gap-2 overflow-x-auto [scrollbar-width:none] ${className}`}>
            {!connected && (
                <p role="status" className={`${chip} border-default bg-surface-sunken pr-3 text-fg`}>
                    <WifiOffIcon size={15}/>
                    <span>
                        {online ? "Can't reach RoomTrack" : "Offline"} — view only
                        {dataUpdatedAt > 0 && (
                            <span className="font-medium text-muted">
                                , as of {format(dataUpdatedAt, isToday(dataUpdatedAt) ? "HH:mm" : "d MMM, HH:mm")}
                            </span>
                        )}
                    </span>
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
