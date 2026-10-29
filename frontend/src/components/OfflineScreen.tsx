import {useEffect, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {isKeptOffline} from "../lib/offlineCalendar";
import {WifiOffIcon} from "./icons";
import Button from "./ui/Button";
import Card from "./ui/Card";

// Give up waiting for the retry after this long (paused requests otherwise wait for the connection forever).
const RETRY_TIMEOUT_MS = 8000;

/**
 * Shown instead of a page while there is no connection or the server doesn't answer (the calendar instead shows
 * its saved copy, view only). The pages' last loaded data is dropped here, so after reconnecting they load fresh
 * from the server instead of flashing out-of-date data; only the calendar's saved copy is kept.
 */
export default function OfflineScreen({offline, calendarSaved}: { offline: boolean; calendarSaved: boolean }) {
    const queryClient = useQueryClient();
    const [retrying, setRetrying] = useState(false);

    // The page this replaced has just unmounted, so its queries are inactive: forget their data.
    useEffect(() => {
        queryClient.removeQueries({type: "inactive", predicate: (query) => !isKeptOffline(query.queryKey)});
    }, [queryClient]);

    async function tryAgain() {
        setRetrying(true);
        // The menu's own requests (account, alerts) are still active: any answer from the server brings the page back.
        await Promise.race([
            queryClient.refetchQueries({type: "active"}),
            new Promise((resolve) => window.setTimeout(resolve, RETRY_TIMEOUT_MS)),
        ]);
        setRetrying(false);
    }

    return (
        <div className="pt-[env(safe-area-inset-top)] sm:pt-0">
            <Card className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center sm:mt-12">
                <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-on-primary-soft">
                    <WifiOffIcon size={28}/>
                </span>
                <div role="alert">
                    <h1 className="text-title-1 text-fg">{offline ? "You're offline" : "Can't reach RoomTrack"}</h1>
                    <p className="mt-3 max-w-sm text-body-sm text-muted">
                        {offline
                            ? "Check your internet connection. This page shows again as soon as you're back online."
                            : "The server isn't answering right now. This page shows again as soon as it's back."}
                        {calendarSaved && " Meanwhile, the Calendar shows your last saved bookings (view only)."}
                    </p>
                </div>
                <Button size="lg" className="mt-3" onClick={tryAgain} loading={retrying} loadingLabel="Trying again…">
                    Try again
                </Button>
            </Card>
        </div>
    );
}
