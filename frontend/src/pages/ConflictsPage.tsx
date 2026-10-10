import {useState} from "react";
import {useMutation, useQueries, useQuery, useQueryClient} from "@tanstack/react-query";
import {Link} from "react-router-dom";
import {differenceInCalendarDays} from "date-fns";
import {dismissConflict, getOpenConflicts, type SyncConflict} from "../lib/api/conflicts";
import {getReservation, type ReservationResponse} from "../lib/api/reservations";
import {allUnitsQuery} from "../lib/api/units";
import {propertiesQuery} from "../lib/api/properties";
import {apiErrorMessage} from "../lib/api/client";
import {formatStayDays, formatWhen, parseLocalDate} from "../lib/dates";
import {PLATFORM_NAME} from "../lib/syncErrors";
import {useToast} from "../lib/toast";
import ConfirmDialog from "../components/ConfirmDialog";
import {AlertIcon, CheckIcon} from "../components/icons";

// What channels put in SUMMARY when they don't share guest details — not worth showing.
const GENERIC_SUMMARY = /^(closed\s*-\s*)?not available$|^reserved$|^blocked$|^airbnb \(not available\)$/i;

function nights(checkIn: string, checkOut: string) {
    const n = differenceInCalendarDays(parseLocalDate(checkOut), parseLocalDate(checkIn));
    return `${n} ${n === 1 ? "night" : "nights"}`;
}

export default function ConflictsPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [confirming, setConfirming] = useState<SyncConflict | null>(null);

    const {data: conflicts, isLoading} = useQuery({queryKey: ["conflicts"], queryFn: getOpenConflicts});
    const {data: units} = useQuery(allUnitsQuery);
    const {data: properties} = useQuery(propertiesQuery);
    const reservationIds = [...new Set((conflicts ?? []).map((c) => c.conflictingReservationId).filter(Boolean))];
    const reservationQueries = useQueries({
        queries: reservationIds.map((id) => ({
            queryKey: ["reservations", "detail", id],
            queryFn: () => getReservation(id),
        })),
    });
    const reservationById = new Map<string, ReservationResponse>();
    reservationQueries.forEach((q) => q.data && reservationById.set(q.data.id, q.data));

    const dismissMutation = useMutation({
        mutationFn: (c: SyncConflict) => dismissConflict(c.id),
        onSuccess: async () => {
            setConfirming(null);
            await queryClient.invalidateQueries({queryKey: ["conflicts"]});
            toast.show("Warning dismissed. Your booking stays as it is.");
        },
    });

    const unitById = new Map(units?.map((u) => [u.id, u]));
    const propertyById = new Map(properties?.map((p) => [p.id, p]));

    return (
        <div>
            <h1 className="page-title">Booking conflicts</h1>
            <p className="page-subtitle mb-6">
                Booking.com or Airbnb reported a stay on dates you already have booked. Nothing was changed
                automatically — decide which booking is right for each one.
            </p>

            {isLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
            ) : !conflicts || conflicts.length === 0 ? (
                <div className="surface flex flex-col items-center gap-2 py-10 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                        <CheckIcon size={22}/>
                    </span>
                    <p className="font-semibold text-slate-700">No conflicts</p>
                    <p className="text-sm text-slate-500">Your channels agree with your calendar.</p>
                </div>
            ) : (
                <ul className="space-y-4">
                    {conflicts.map((c) => {
                        const platform = PLATFORM_NAME[c.platform] ?? c.platform;
                        const unit = unitById.get(c.unitId);
                        const property = unit ? propertyById.get(unit.propertyId) : undefined;
                        const existing = reservationById.get(c.conflictingReservationId);
                        const existingName = existing?.guestName?.trim() || "the existing booking";
                        const incoming = formatStayDays(c.incomingStart, c.incomingEnd);
                        const note = c.incomingSummary && !GENERIC_SUMMARY.test(c.incomingSummary.trim())
                            ? c.incomingSummary : null;

                        return (
                            <li key={c.id} className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                                        <AlertIcon size={16}/>
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-slate-900">
                                            {c.unitName}
                                            {property && <span className="font-normal text-slate-500"> · {property.name}</span>}
                                        </p>
                                        <p className="mt-0.5 text-sm text-slate-600">
                                            {c.kind === "NEW_OVERLAP"
                                                ? `${platform} has a new booking that overlaps a stay already on your calendar.`
                                                : `A ${platform} booking moved to dates that overlap a stay already on your calendar. It still shows its old dates for now.`}
                                        </p>
                                    </div>
                                </div>

                                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                                    <div className="rounded-xl bg-red-50 px-3.5 py-2.5">
                                        <dt className="text-xs font-semibold text-red-700">{platform} says</dt>
                                        <dd className="mt-0.5 font-semibold text-slate-900">
                                            {incoming} <span className="font-normal text-slate-500">· {nights(c.incomingStart, c.incomingEnd)}</span>
                                        </dd>
                                        {note && <dd className="mt-0.5 text-slate-600">“{note}”</dd>}
                                    </div>
                                    <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                                        <dt className="text-xs font-semibold text-slate-600">Your calendar has</dt>
                                        <dd className="mt-0.5 font-semibold text-slate-900">
                                            {existing ? (
                                                <>
                                                    {existingName}{" "}
                                                    <span className="block font-normal text-slate-600">{formatStayDays(existing.checkIn, existing.checkOut)}</span>
                                                </>
                                            ) : "A booking on these dates"}
                                        </dd>
                                    </div>
                                </dl>

                                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                    <Link
                                        to={`/dashboard/reservations/${c.conflictingReservationId}`}
                                        className="btn btn-primary min-h-11"
                                    >
                                        Change {existing ? `${existingName}’s` : "my"} booking
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            dismissMutation.reset();
                                            setConfirming(c);
                                        }}
                                        className="btn btn-secondary min-h-11"
                                    >
                                        Keep my booking
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    “Keep my booking” hides this warning. Your reservation is not changed.
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Reported {formatWhen(c.createdAt)}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            <ConfirmDialog
                open={confirming !== null}
                variant="neutral"
                title="Keep your booking?"
                message={confirming && (
                    <>
                        We’ll stop warning you about these dates. To avoid a double booking, make sure{" "}
                        <strong>{formatStayDays(confirming.incomingStart, confirming.incomingEnd)}</strong> is closed or
                        cancelled on {PLATFORM_NAME[confirming.platform] ?? confirming.platform}.
                    </>
                )}
                confirmLabel="Keep my booking"
                pendingLabel="Saving…"
                cancelLabel="Go back"
                pending={dismissMutation.isPending}
                error={dismissMutation.isError ? apiErrorMessage(dismissMutation.error, "Couldn't dismiss this warning.") : null}
                onConfirm={() => confirming && dismissMutation.mutate(confirming)}
                onCancel={() => setConfirming(null)}
            />
        </div>
    );
}
