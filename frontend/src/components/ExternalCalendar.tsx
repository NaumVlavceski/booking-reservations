import {apiErrorMessage} from "../lib/api/client";
import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    addCalendar,
    deleteCalendar,
    getUnitCalendars,
    syncCalendarNow,
    type ExternalCalendar,
} from "../lib/api/calendars";
import {formatWhen} from "../lib/dates";
import {describeSyncError, PLATFORM_NAME} from "../lib/syncErrors";
import {useToast} from "../lib/toast";
import ConfirmDialog from "./ConfirmDialog";
import SyncProblem from "./SyncProblem";

export default function ExternalCalendars({unitId}: { unitId: string }) {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [platform, setPlatform] = useState<"BOOKING" | "AIRBNB">("BOOKING");
    const [icsUrl, setIcsUrl] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [removing, setRemoving] = useState<ExternalCalendar | null>(null);

    const {data: calendars, isLoading} = useQuery({
        queryKey: ["calendars", unitId],
        queryFn: () => getUnitCalendars(unitId),
    });

    const availablePlatforms = (["BOOKING", "AIRBNB"] as const).filter(
        (p) => !calendars?.some((c) => c.platform === p)
    );
    // Keep the dropdown on a platform that can still be added.
    const selectedPlatform = availablePlatforms.includes(platform) ? platform : availablePlatforms[0];

    const addMutation = useMutation({
        mutationFn: () => addCalendar(unitId, selectedPlatform, icsUrl.trim()),
        onSuccess: (added) => {
            queryClient.invalidateQueries({queryKey: ["calendars"]});
            setIcsUrl("");
            setFormError(null);
            toast.show(`${PLATFORM_NAME[added.platform]} connected. Press Sync now to bring its bookings in.`);
        },
        onError: (err) => setFormError(apiErrorMessage(err, "Couldn't connect that calendar.")),
    });

    const deleteMutation = useMutation({
        mutationFn: (c: ExternalCalendar) => deleteCalendar(c.id),
        onSuccess: (_data, c) => {
            setRemoving(null);
            queryClient.invalidateQueries({queryKey: ["calendars"]});
            toast.show(`${PLATFORM_NAME[c.platform]} disconnected from this room.`);
        },
    });

    const syncMutation = useMutation({
        mutationFn: (c: ExternalCalendar) => syncCalendarNow(c.id),
        onSuccess: async (result) => {
            await queryClient.invalidateQueries();
            const name = PLATFORM_NAME[result.platform];
            if (result.lastError) {
                toast.show(`Still failing: ${describeSyncError(result.lastError, result.platform).title}`, {tone: "error"});
            } else {
                toast.show(`Synced with ${name}. The calendar is up to date.`);
            }
        },
        onError: (err) => toast.show(apiErrorMessage(err, "Couldn't sync that calendar."), {tone: "error"}),
    });

    function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        addMutation.mutate();
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Bring in bookings from other channels</h2>
            <p className="mt-0.5 mb-3 text-sm text-slate-600">
                Paste the calendar export link from Booking.com or Airbnb. Their bookings then appear on your calendar
                automatically.
            </p>

            {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

            {calendars && calendars.length > 0 && (
                <ul className="mb-4 space-y-2">
                    {calendars.map((c) => {
                        const syncing = syncMutation.isPending && syncMutation.variables?.id === c.id;
                        return (
                            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-900">{PLATFORM_NAME[c.platform]}</span>
                                        <StatusPill calendar={c}/>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => syncMutation.mutate(c)}
                                            disabled={syncMutation.isPending}
                                            className="btn btn-secondary min-h-11 px-3"
                                        >
                                            {syncing ? "Syncing…" : "Sync now"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                deleteMutation.reset();
                                                setRemoving(c);
                                            }}
                                            className="btn btn-danger-ghost min-h-11 px-3"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                {c.lastError && (
                                    <div className="mt-2">
                                        <SyncProblem error={c.lastError} platform={c.platform}/>
                                    </div>
                                )}
                                <p className="mt-2 text-xs text-slate-500">
                                    Last synced successfully: {formatWhen(c.lastSuccessAt)}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            {availablePlatforms.length > 0 ? (
                <form onSubmit={handleAdd} className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="sr-only" htmlFor={`platform-${unitId}`}>Channel</label>
                        <select
                            id={`platform-${unitId}`}
                            value={selectedPlatform}
                            onChange={(e) => setPlatform(e.target.value as "BOOKING" | "AIRBNB")}
                            className="field-input sm:w-40"
                        >
                            {availablePlatforms.map((p) => (
                                <option key={p} value={p}>{PLATFORM_NAME[p]}</option>
                            ))}
                        </select>
                        <label className="sr-only" htmlFor={`ics-${unitId}`}>Calendar export link</label>
                        <input
                            id={`ics-${unitId}`}
                            type="url"
                            inputMode="url"
                            value={icsUrl}
                            onChange={(e) => setIcsUrl(e.target.value)}
                            placeholder="https://… .ics link"
                            required
                            className="field-input min-w-0 flex-1"
                        />
                        <button type="submit" disabled={addMutation.isPending} className="btn btn-primary min-h-11 shrink-0">
                            {addMutation.isPending ? "Connecting…" : "Connect"}
                        </button>
                    </div>
                    {formError && <p className="alert-error">{formError}</p>}
                </form>
            ) : (
                <p className="text-sm text-slate-500">Booking.com and Airbnb are both connected for this room.</p>
            )}

            <ConfirmDialog
                open={removing !== null}
                title={removing ? `Disconnect ${PLATFORM_NAME[removing.platform]}?` : ""}
                message={removing && (
                    <>
                        New {PLATFORM_NAME[removing.platform]} bookings will stop appearing for this room. Bookings
                        already imported stay on your calendar, but won’t update anymore.
                    </>
                )}
                confirmLabel="Disconnect"
                pendingLabel="Disconnecting…"
                cancelLabel="Keep connected"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError ? apiErrorMessage(deleteMutation.error, "Couldn't disconnect this calendar.") : null}
                onConfirm={() => removing && deleteMutation.mutate(removing)}
                onCancel={() => setRemoving(null)}
            />
        </section>
    );
}

function StatusPill({calendar}: { calendar: ExternalCalendar }) {
    if (calendar.lastError) {
        return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Not syncing</span>;
    }
    if (calendar.lastSuccessAt) {
        return <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">Syncing</span>;
    }
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Not synced yet</span>;
}
