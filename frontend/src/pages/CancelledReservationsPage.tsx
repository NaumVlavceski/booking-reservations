import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {isAxiosError} from "axios";
import {Link} from "react-router-dom";
import {getReservations, restoreReservation, type ReservationResponse} from "../lib/api/reservations";
import {allUnitsQuery} from "../lib/api/units";
import {propertiesQuery} from "../lib/api/properties";
import {apiErrorMessage} from "../lib/api/client";
import {formatStay, parseLocalDate} from "../lib/dates";
import {useToast} from "../lib/toast";
import {CalendarXIcon} from "../components/icons";

const SOURCE_LABEL: Record<string, string> = {DIRECT: "Direct", BOOKING: "Booking.com", AIRBNB: "Airbnb"};

export default function CancelledReservationsPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const {data: cancelled, isLoading} = useQuery({
        queryKey: ["reservations", "cancelled"],
        queryFn: () => getReservations({status: "CANCELLED"}),
    });
    const {data: units} = useQuery(allUnitsQuery);
    const {data: properties} = useQuery(propertiesQuery);

    const restoreMutation = useMutation({
        mutationFn: (r: ReservationResponse) => restoreReservation(r),
        onSuccess: async (_data, r) => {
            await queryClient.invalidateQueries({queryKey: ["reservations"]});
            toast.show(`${r.guestName || "Booking"} is back on the calendar.`);
        },
        onError: (error) => {
            const message = isAxiosError(error) && error.response?.status === 409
                ? "Can't restore: some of those nights have been booked since. Change its dates first, then restore it."
                : apiErrorMessage(error, "Couldn't restore this booking.");
            toast.show(message, {tone: "error"});
        },
    });

    const unitById = new Map(units?.map((u) => [u.id, u]));
    const propertyById = new Map(properties?.map((p) => [p.id, p]));
    // Upcoming stays first (soonest at the top), then past ones (most recent first).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sorted = [...(cancelled ?? [])].sort((a, b) => {
        const aFuture = parseLocalDate(a.checkOut) >= today;
        const bFuture = parseLocalDate(b.checkOut) >= today;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return aFuture ? a.checkIn.localeCompare(b.checkIn) : b.checkIn.localeCompare(a.checkIn);
    });

    return (
        <div>
            <h1 className="page-title">Cancelled bookings</h1>
            <p className="page-subtitle mb-6">
                Cancelled bookings free up their dates. Restore one to put it back on the calendar — as long as
                those dates are still free.
            </p>

            {isLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
            ) : sorted.length === 0 ? (
                <div className="surface flex flex-col items-center gap-2 py-10 text-center">
                    <CalendarXIcon size={28} className="text-slate-300"/>
                    <p className="font-semibold text-slate-700">No cancelled bookings</p>
                    <p className="text-sm text-slate-500">When you cancel a booking, it shows up here.</p>
                </div>
            ) : (
                <ul className="stack-list">
                    {sorted.map((r) => {
                        const unit = unitById.get(r.unitId);
                        const property = unit ? propertyById.get(unit.propertyId) : undefined;
                        const restoring = restoreMutation.isPending && restoreMutation.variables?.id === r.id;
                        return (
                            <li key={r.id} className="stack-row flex items-center gap-3">
                                <Link to={`/dashboard/reservations/${r.id}`} className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-slate-900">{r.guestName || "No guest name"}</p>
                                    <p className="truncate text-sm text-slate-600">
                                        {formatStay(r.checkIn, r.checkOut)}
                                        {unit && ` · ${unit.name}`}
                                    </p>
                                    <p className="truncate text-xs text-slate-500">
                                        {[property?.name, SOURCE_LABEL[r.source], r.totalAmount ? `Total ${r.totalAmount}` : null]
                                            .filter(Boolean).join(" · ")}
                                    </p>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => restoreMutation.mutate(r)}
                                    disabled={restoreMutation.isPending}
                                    className="btn btn-secondary min-h-11 shrink-0"
                                >
                                    {restoring ? "Restoring…" : "Restore"}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
