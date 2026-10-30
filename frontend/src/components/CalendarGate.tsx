import type {ReactNode} from "react";
import {useQuery} from "@tanstack/react-query";
import {propertiesQuery} from "../lib/api/properties";
import {allUnitsQuery} from "../lib/api/units";
import {allReservationsQuery} from "../lib/api/reservations";
import {useConnected} from "../lib/apiReachability";
import {ErrorState, RefreshFailed, Skeleton, SlowLoadingHint} from "./ui/States";

/**
 * Loading and error states around the calendar (CalendarPage itself only draws data). It renders the calendar
 * once properties, rooms *and* bookings are all there: a calendar drawn without its bookings would look free.
 */
export default function CalendarGate({children}: { children: ReactNode }) {
    const connected = useConnected();
    const queries = [useQuery(propertiesQuery), useQuery(allUnitsQuery), useQuery(allReservationsQuery)];
    const missing = queries.filter((q) => q.data === undefined);

    if (missing.length === 0) {
        // Offline the strip above the calendar already says it's a saved copy.
        const failed = connected ? queries.find((q) => q.isError) : undefined;
        return (
            <>
                {failed && (
                    <RefreshFailed error={failed.error} className="mx-4 mb-3 sm:mx-0"
                                   onRetry={() => queries.forEach((q) => q.isError && q.refetch())}
                                   retrying={queries.some((q) => q.isFetching)}/>
                )}
                {children}
            </>
        );
    }

    const failed = missing.find((q) => q.isError);
    if (failed) {
        return (
            <div className="px-4 pt-[env(safe-area-inset-top)] sm:px-0 sm:pt-0">
                <ErrorState title="Couldn't load your calendar" error={failed.error}
                            onRetry={() => missing.forEach((q) => q.refetch())}
                            retrying={missing.some((q) => q.isFetching)}/>
            </div>
        );
    }

    return <CalendarSkeleton/>;
}

/** The calendar's shape (toolbar, date header, a few rooms) while it loads, so nothing jumps when it arrives. */
function CalendarSkeleton() {
    return (
        <div className="cal-root" role="status" aria-live="polite">
            <span className="sr-only">Loading calendar…</span>
            <div className="cal-toolbar">
                <Skeleton className="h-11 w-24 rounded-full"/>
                <div className="ml-auto flex gap-2">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="size-11 rounded-full"/>)}
                </div>
            </div>
            <div className="cal-shell">
                <div className="flex h-[74px] border-b border-subtle">
                    <div className="w-[104px] shrink-0 border-r border-subtle sm:w-[120px]"/>
                    <div className="flex flex-1 items-end gap-3 px-3 pb-3">
                        {Array.from({length: 7}, (_, i) => <Skeleton key={i} className="h-8 flex-1 rounded-lg"/>)}
                    </div>
                </div>
                {[0.55, 0.35, 0.7, 0.45].map((width, i) => (
                    <div key={i} className="flex h-[50px] items-center border-b border-subtle sm:h-16">
                        <div className="w-[104px] shrink-0 space-y-1.5 px-3 sm:w-[120px]">
                            <Skeleton className="h-3.5 w-16"/>
                            <Skeleton className="h-3 w-10"/>
                        </div>
                        <div className="flex-1 px-3">
                            <Skeleton className="h-7 rounded-lg" style={{width: `${width * 100}%`, marginLeft: `${i * 9}%`}}/>
                        </div>
                    </div>
                ))}
            </div>
            <SlowLoadingHint/>
        </div>
    );
}
