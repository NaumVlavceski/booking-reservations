import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    addCalendar,
    deleteCalendar,
    getUnitCalendars,
    syncCalendarNow,
    type ExternalCalendar,
} from "../lib/api/calendars";

const PLATFORM_LABEL: Record<string, string> = { BOOKING: "Booking", AIRBNB: "Airbnb" };

function formatWhen(iso: string | null) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString();
}

export default function ExternalCalendars({ unitId }: { unitId: string }) {
    const queryClient = useQueryClient();
    const [platform, setPlatform] = useState<"BOOKING" | "AIRBNB">("BOOKING");
    const [icsUrl, setIcsUrl] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    const { data: calendars, isLoading } = useQuery({
        queryKey: ["calendars", unitId],
        queryFn: () => getUnitCalendars(unitId),
    });

    const addMutation = useMutation({
        mutationFn: () => addCalendar(unitId, platform, icsUrl),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["calendars", unitId] });
            setIcsUrl("");
            setFormError(null);
        },
        onError: (err: any) => {
            setFormError(err.response?.data?.message ?? "Couldn't add that calendar.");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteCalendar,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendars", unitId] }),
    });

    const syncMutation = useMutation({
        mutationFn: syncCalendarNow,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendars", unitId] }),
    });

    const availablePlatforms = (["BOOKING", "AIRBNB"] as const).filter(
        (p) => !calendars?.some((c) => c.platform === p)
    );

    function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        addMutation.mutate();
    }

    return (
        <div className="bg-slate-50 border rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Import from other channels</p>
            <p className="text-xs text-gray-600 mb-3">
                Paste a Booking.com or Airbnb calendar export link to automatically bring
                their reservations into Staytrack.
            </p>

            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

            {calendars && calendars.length > 0 && (
                <div className="space-y-2 mb-4">
                    {calendars.map((c) => (
                        <CalendarRow
                            key={c.id}
                            calendar={c}
                            onDelete={() => deleteMutation.mutate(c.id)}
                            onSync={() => syncMutation.mutate(c.id)}
                            deleting={deleteMutation.isPending}
                            syncing={syncMutation.isPending}
                        />
                    ))}
                </div>
            )}

            {availablePlatforms.length > 0 ? (
                <form onSubmit={handleAdd} className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <select
                            value={platform}
                            onChange={(e) => setPlatform(e.target.value as "BOOKING" | "AIRBNB")}
                            className="border rounded px-2 py-2 text-sm bg-white"
                        >
                            {availablePlatforms.map((p) => (
                                <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
                            ))}
                        </select>
                        <input
                            value={icsUrl}
                            onChange={(e) => setIcsUrl(e.target.value)}
                            placeholder="https://..."
                            required
                            className="flex-1 min-w-0 border rounded px-3 py-2 text-sm"
                        />
                        <button
                            type="submit"
                            disabled={addMutation.isPending}
                            className="shrink-0 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-teal-700 disabled:opacity-50"
                        >
                            {addMutation.isPending ? "Adding…" : "Connect"}
                        </button>
                    </div>
                    {formError && <p className="text-xs text-red-600">{formError}</p>}
                </form>
            ) : (
                <p className="text-xs text-gray-500">Both channels are already connected for this room.</p>
            )}
        </div>
    );
}

function CalendarRow({
                         calendar,
                         onDelete,
                         onSync,
                         deleting,
                         syncing,
                     }: {
    calendar: ExternalCalendar;
    onDelete: () => void;
    onSync: () => void;
    deleting: boolean;
    syncing: boolean;
}) {
    const hasError = !!calendar.lastError;
    return (
        <div className="bg-white border rounded p-3">
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-sm font-medium text-gray-900">
                        {PLATFORM_LABEL[calendar.platform]}
                    </span>
                    {hasError ? (
                        <span className="ml-2 text-xs text-red-700 bg-red-50 rounded px-1.5 py-0.5">
                            Sync failing
                        </span>
                    ) : calendar.lastSuccessAt ? (
                        <span className="ml-2 text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5">
                            Connected
                        </span>
                    ) : (
                        <span className="ml-2 text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                            Not synced yet
                        </span>
                    )}
                </div>
                <div className="flex gap-3 text-xs">
                    <button
                        type="button"
                        onClick={onSync}
                        disabled={syncing}
                        className="text-teal-700 font-medium hover:underline disabled:opacity-50"
                    >
                        {syncing ? "Syncing…" : "Sync now"}
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={deleting}
                        className="text-red-600 font-medium hover:underline disabled:opacity-50"
                    >
                        Remove
                    </button>
                </div>
            </div>
            {hasError && (
                <p className="text-xs text-red-700 mt-1.5">{calendar.lastError}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
                Last success: {formatWhen(calendar.lastSuccessAt)}
            </p>
        </div>
    );
}