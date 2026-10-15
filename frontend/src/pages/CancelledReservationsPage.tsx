import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {isAxiosError} from "axios";
import {useState} from "react";
import {Link} from "react-router-dom";
import {getCancelledReservations, restoreReservation, type ReservationResponse} from "../lib/api/reservations";
import {allUnitsQuery} from "../lib/api/units";
import {propertiesQuery} from "../lib/api/properties";
import {apiErrorMessage} from "../lib/api/client";
import {formatStay, formatWhen} from "../lib/dates";
import {useDebouncedValue} from "../lib/useDebouncedValue";
import {useToast} from "../lib/toast";
import {CalendarXIcon, ChevronLeftIcon, ChevronRightIcon} from "../components/icons";
import DateFilter from "../components/DateFilter";

const SOURCE_LABEL: Record<string, string> = {DIRECT: "Direct", BOOKING: "Booking.com", AIRBNB: "Airbnb"};
const PAGE_SIZE = 20;

export default function CancelledReservationsPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [name, setName] = useState("");
    const [checkInFrom, setCheckInFrom] = useState("");
    const [page, setPage] = useState(0);
    // Wait for a pause in typing before asking the server
    const searchName = useDebouncedValue(name.trim());

    const {data, isLoading, isFetching} = useQuery({
        queryKey: ["reservations", "cancelled", {page, name: searchName, checkInFrom}],
        queryFn: () => getCancelledReservations({page, size: PAGE_SIZE, name: searchName, checkInFrom}),
        placeholderData: keepPreviousData, // keep showing the old page while the next one loads
    });
    const {data: units} = useQuery(allUnitsQuery);
    const {data: properties} = useQuery(propertiesQuery);

    const items = data?.items ?? [];
    const totalPages = data?.totalPages ?? 0;
    const totalElements = data?.totalElements ?? 0;

    // Restoring the last booking on the last page leaves that page empty: step back to the new last one
    if (data && page > 0 && page >= data.totalPages) setPage(Math.max(data.totalPages - 1, 0));

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

    const filtering = searchName !== "" || checkInFrom !== "";
    const showFilters = filtering || name !== "" || totalElements > 0;

    function changeName(value: string) {
        setName(value);
        setPage(0);
    }

    function changeDate(value: string) {
        setCheckInFrom(value);
        setPage(0);
    }

    function clearFilters() {
        setName("");
        setCheckInFrom("");
        setPage(0);
    }

    function goTo(next: number) {
        setPage(next);
        window.scrollTo({top: 0, behavior: "smooth"});
    }

    const summary = `${totalElements} ${filtering ? "matching" : "cancelled"} ${totalElements === 1 ? "booking" : "bookings"}`;

    return (
        <div>
            <h1 className="page-title">Cancelled bookings</h1>
            <p className="page-subtitle mb-6">
                Cancelled bookings free up their dates. Restore one to put it back on the calendar — as long as
                those dates are still free.
            </p>

            {showFilters && (
                <div className="surface mb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="field-label" htmlFor="cancelled-name">Guest name starts with</label>
                            <input
                                id="cancelled-name"
                                type="search"
                                value={name}
                                onChange={(e) => changeName(e.target.value)}
                                placeholder="e.g. Ana"
                                autoComplete="off"
                                className="field-input"
                            />
                        </div>
                        <DateFilter label="Check-in from" value={checkInFrom} onChange={changeDate}/>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                        <p aria-live="polite">
                            {summary} · {checkInFrom ? "latest check-in first" : "most recently cancelled first"}
                        </p>
                        {(name !== "" || checkInFrom !== "") && (
                            <button type="button" onClick={clearFilters} className="btn btn-ghost min-h-11">
                                Clear filters
                            </button>
                        )}
                    </div>
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
                <div className="surface flex flex-col items-center gap-2 py-10 text-center">
                    <CalendarXIcon size={28} className="text-slate-300"/>
                    {filtering ? (
                        <>
                            <p className="font-semibold text-slate-700">No cancelled bookings match</p>
                            <p className="text-sm text-slate-500">Try a different name or an earlier date.</p>
                        </>
                    ) : (
                        <>
                            <p className="font-semibold text-slate-700">No cancelled bookings</p>
                            <p className="text-sm text-slate-500">When you cancel a booking, it shows up here.</p>
                        </>
                    )}
                </div>
            ) : (
                <>
                    <ul className={`stack-list transition-opacity ${isFetching ? "opacity-60" : ""}`}>
                        {items.map((r) => {
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
                                            {[property?.name, SOURCE_LABEL[r.source], r.totalAmount ? `Total ${r.totalAmount}` : null, r.cancelledAt ? `Cancelled ${formatWhen(r.cancelledAt)}` : null]
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

                    {totalPages > 1 && (
                        <nav aria-label="Cancelled bookings pages" className="mt-4 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => goTo(page - 1)}
                                disabled={page === 0}
                                className="btn btn-secondary min-h-11"
                            >
                                <ChevronLeftIcon size={16}/>
                                Previous
                            </button>
                            <p className="text-sm text-slate-600" aria-live="polite">
                                Page {page + 1} of {totalPages}
                            </p>
                            <button
                                type="button"
                                onClick={() => goTo(page + 1)}
                                disabled={page >= totalPages - 1}
                                className="btn btn-secondary min-h-11"
                            >
                                Next
                                <ChevronRightIcon size={16}/>
                            </button>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
