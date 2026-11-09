import {useQuery} from "@tanstack/react-query";
import {useLocation} from "react-router-dom";
import {useConnected} from "./apiReachability";
import {pollOpenConflicts} from "./api/conflicts";
import {pollFailingCalendars} from "./api/calendars";

/**
 * Open booking conflicts and failing channel syncs — polled so warnings appear without a refresh. These are
 * background calls (X-Background), so the polling alone never keeps a session alive.
 */
export function useSyncAlerts() {
    const {data: conflicts} = useQuery({
        queryKey: ["conflicts"],
        queryFn: pollOpenConflicts,
        refetchInterval: 60_000,
    });
    const {data: failing} = useQuery({
        queryKey: ["calendars", "health"],
        queryFn: pollFailingCalendars,
        refetchInterval: 60_000,
    });
    const conflictCount = conflicts?.length ?? 0;
    const failingCount = failing?.length ?? 0;
    return {conflictCount, failingCount, total: conflictCount + failingCount};
}

/** Whether the SyncAlerts strip has anything to show on this page (offline, or alerts for another page). */
export function useAlertStripVisible(): boolean {
    const {conflictCount, failingCount} = useSyncAlerts();
    const connected = useConnected();
    const {pathname} = useLocation();
    return !connected
        || (conflictCount > 0 && pathname !== "/dashboard/conflicts")
        || (failingCount > 0 && pathname !== "/dashboard/sync-health");
}
