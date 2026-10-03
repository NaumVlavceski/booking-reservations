import { useQuery } from "@tanstack/react-query";
import { getFailingCalendars } from "../lib/api/calendars";

const PLATFORM_LABEL: Record<string, string> = { BOOKING: "Booking.com", AIRBNB: "Airbnb" };

function formatWhen(iso: string | null) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString();
}

export default function SyncHealthPage() {
    const { data: failing, isLoading } = useQuery({
        queryKey: ["calendars", "health"],
        queryFn: getFailingCalendars,
    });

    if (isLoading) return <p className="text-gray-500">Loading…</p>;

    return (
        <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Calendar sync health</h1>
            <p className="text-sm text-gray-600 mb-6">
                These connected calendars have not synced successfully. Your calendar may be
                missing bookings from these channels until the feed URL works again.
            </p>

            {(!failing || failing.length === 0) && (
                <div className="bg-white border rounded-lg p-8 text-center text-gray-500">
                    All connected calendars are syncing normally.
                </div>
            )}

            <div className="space-y-3">
                {failing?.map((c) => (
                    <div key={c.id} className="bg-white border border-amber-200 rounded-lg p-5">
                        <div className="font-semibold text-gray-900">
                            {c.unitName} — {PLATFORM_LABEL[c.platform] ?? c.platform}
                        </div>
                        <div className="text-sm text-red-700 mt-2 bg-red-50 rounded px-3 py-2">
                            {c.lastError}
                        </div>
                        <div className="text-xs text-gray-500 mt-2 flex gap-4">
                            <span>Last attempted: {formatWhen(c.lastSyncedAt)}</span>
                            <span>Last success: {formatWhen(c.lastSuccessAt)}</span>
                            <span>{c.consecutiveFailures} consecutive failure{c.consecutiveFailures === 1 ? "" : "s"}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}