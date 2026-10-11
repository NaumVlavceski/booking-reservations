import {useMutation, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "react-router-dom";
import {getFailingCalendars, syncAllCalendars} from "../lib/api/calendars";
import {apiErrorMessage} from "../lib/api/client";
import {useToast} from "../lib/toast";
import {RefreshIcon} from "./icons";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The calendar's one "sync" button: pulls the latest from Booking.com/Airbnb
 * for every connected room, then reloads everything on screen, and says what
 * happened. Calendars synced in the last minute are skipped by the server.
 */
export default function SyncAllButton() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const toast = useToast();

    const mutation = useMutation({
        mutationFn: syncAllCalendars,
        onSuccess: async ({triggered, skipped, total}) => {
            await queryClient.invalidateQueries();
            const failing = (await queryClient.fetchQuery({
                queryKey: ["calendars", "health"],
                queryFn: getFailingCalendars,
            })).length;

            if (total === 0) {
                toast.show("Calendar is up to date. No Booking.com or Airbnb calendars are connected yet.", {tone: "info"});
            } else if (failing > 0) {
                toast.show(`${plural(failing, "calendar isn't", "calendars aren't")} syncing.`, {
                    tone: "error",
                    action: {label: "See why", onClick: () => navigate("/dashboard/sync-health")},
                });
            } else if (triggered === 0 && skipped > 0) {
                toast.show("Calendar is up to date — channels were synced less than a minute ago.");
            } else {
                toast.show(`Synced ${plural(triggered, "calendar", "calendars")}. Everything is up to date.`);
            }
        },
        onError: (error) => {
            toast.show(apiErrorMessage(error, "Couldn't sync right now. Check your connection and try again."), {tone: "error"});
        },
    });

    return (
        <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            aria-label={mutation.isPending ? "Syncing calendars" : "Sync calendars"}
            title="Sync with Booking.com and Airbnb"
            className="cal-icon-btn cal-sync-btn"
        >
            <RefreshIcon size={20} className={mutation.isPending ? "cal-spin" : undefined}/>
        </button>
    );
}
