import {useQuery} from "@tanstack/react-query";
import {getOpenConflicts} from "./api/conflicts";
import {getFailingCalendars} from "./api/calendars";

/** Open booking conflicts and failing channel syncs — polled so warnings appear without a refresh. */
export function useSyncAlerts() {
    const {data: conflicts} = useQuery({
        queryKey: ["conflicts"],
        queryFn: getOpenConflicts,
        refetchInterval: 60_000,
    });
    const {data: failing} = useQuery({
        queryKey: ["calendars", "health"],
        queryFn: getFailingCalendars,
        refetchInterval: 60_000,
    });
    const conflictCount = conflicts?.length ?? 0;
    const failingCount = failing?.length ?? 0;
    return {conflictCount, failingCount, total: conflictCount + failingCount};
}
