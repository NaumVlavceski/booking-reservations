import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {dismissConflict, getOpenConflicts} from "../lib/api/conflicts.ts";
import {Link} from "react-router-dom";

const PLATFORM_LABEL: Record<string, string> = { BOOKING: "Booking", AIRBNB: "Airbnb" };

export default function ConflictsPage(){
    const queryClient = useQueryClient();
    const {data: conflicts, isLoading} = useQuery({
        queryKey:["conflicts"],
        queryFn:getOpenConflicts,
    });

    const dismissMutation = useMutation({
        mutationFn: dismissConflict,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conflicts"] }),
    });
    if (isLoading) return <p className="text-gray-500">Loading…</p>;
    return (
        <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Booking conflicts</h1>
            <p className="text-sm text-gray-600 mb-6">
                These are dates a connected channel reported that overlap a reservation already on your calendar.
                Nothing has been changed automatically — review each one and update the reservation that's wrong.
            </p>

            {(!conflicts || conflicts.length === 0) && (
                <div className="bg-white border rounded-lg p-8 text-center text-gray-500">
                    No open conflicts. You're all caught up.
                </div>
            )}

            <div className="space-y-3">
                {conflicts?.map((c) => (
                    <div key={c.id} className="bg-white border rounded-lg p-5">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="font-semibold text-gray-900">{c.unitName}</div>
                                <div className="text-sm text-gray-600 mt-1">
                                    {PLATFORM_LABEL[c.platform] ?? c.platform} reports{" "}
                                    <strong>{c.incomingStart}</strong> to <strong>{c.incomingEnd}</strong>
                                    {c.incomingSummary && ` — "${c.incomingSummary}"`}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {c.kind === "NEW_OVERLAP" ? "New booking" : "Date change"} conflicts with an existing reservation
                                </div>
                            </div>
                            <span className="text-xs text-gray-400">
                                {new Date(c.createdAt).toLocaleDateString()}
                            </span>
                        </div>

                        <div className="flex gap-3 mt-4">
                            <Link
                                to={`/dashboard/reservations/${c.conflictingReservationId}`}
                                className="text-sm font-medium text-blue-600 hover:underline"
                            >
                                Review the existing reservation
                            </Link>
                            <button
                                onClick={() => dismissMutation.mutate(c.id)}
                                disabled={dismissMutation.isPending}
                                className="text-sm font-medium text-gray-500 hover:text-gray-700 ml-auto"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}