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
import {CalendarXIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon} from "../components/icons";
import DateFilter from "../components/DateFilter";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Field from "../components/ui/Field";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";
import {SourceBadge} from "../components/ReservationBadges";

const PAGE_SIZE = 20;

export default function CancelledReservationsPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [name, setName] = useState("");
    const [checkInFrom, setCheckInFrom] = useState("");
    const [page, setPage] = useState(0);
    // Wait for a pause in typing before asking the server
    const searchName = useDebouncedValue(name.trim());

    const {data, isLoading, isFetching, isError, refetch, isRefetching} = useQuery({
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

    function restoreButton(r: ReservationResponse) {
        const restoring = restoreMutation.isPending && restoreMutation.variables?.id === r.id;
        return (
            <Button variant="secondary" size="sm" className="min-h-11 shrink-0"
                    onClick={() => restoreMutation.mutate(r)}
                    disabled={restoreMutation.isPending && !restoring}
                    loading={restoring} loadingLabel="Restoring…"
                    aria-label={`Restore ${r.guestName || "booking"}`}>
                Restore
            </Button>
        );
    }

    return (
        <div>
            <PageHeader
                title="Cancelled bookings"
                back={{to: "/dashboard/calendar"}}
                description="Cancelled bookings free up their dates. Restore one to put it back on the calendar — as long as those dates are still free."
            />

            {showFilters && (
                <Card className="mb-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Guest name" id="cancelled-name" leadingIcon>
                            {(control) => (
                                <div className="relative">
                                    <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle"/>
                                    <input
                                        {...control}
                                        type="search"
                                        value={name}
                                        onChange={(e) => changeName(e.target.value)}
                                        placeholder="e.g. Ana"
                                        autoComplete="off"
                                        enterKeyHint="search"
                                        className="field-input pl-10"
                                    />
                                </div>
                            )}
                        </Field>
                        <DateFilter label="Check-in from" value={checkInFrom} onChange={changeDate}/>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-body-sm text-muted">
                        <p aria-live="polite" className="num">
                            {summary} · {checkInFrom ? "latest check-in first" : "most recently cancelled first"}
                        </p>
                        {(name !== "" || checkInFrom !== "") && (
                            <Button variant="ghost" size="sm" className="min-h-11" onClick={clearFilters}>
                                Clear filters
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            {isLoading ? (
                <ListSkeleton rows={4} label="Loading…"/>
            ) : isError && !data ? (
                <ErrorState title="Couldn't load cancelled bookings" onRetry={() => refetch()} retrying={isRefetching}>
                    Check your connection and try again.
                </ErrorState>
            ) : items.length === 0 ? (
                <EmptyState
                    icon={<CalendarXIcon size={24}/>}
                    title={filtering ? "No cancelled bookings match" : "No cancelled bookings"}
                    action={filtering ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined}
                >
                    {filtering ? "Try a different name or an earlier date." : "When you cancel a booking, it shows up here."}
                </EmptyState>
            ) : (
                <>
                    {/* Phones and tablets: cards. */}
                    <ul className={`stack-list transition-opacity lg:hidden ${isFetching ? "opacity-60" : ""}`}>
                        {items.map((r) => {
                            const unit = unitById.get(r.unitId);
                            const property = unit ? propertyById.get(unit.propertyId) : undefined;
                            return (
                                <li key={r.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                    <Link to={`/dashboard/reservations/${r.id}`} className="min-w-0 flex-1">
                                        <span className="block truncate text-title-3 text-fg">{r.guestName || "No guest name"}</span>
                                        <span className="num block truncate text-body-sm text-muted">
                                            {formatStay(r.checkIn, r.checkOut)}
                                            {unit && ` · ${unit.name}`}
                                        </span>
                                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-subtle">
                                            <SourceBadge source={r.source}/>
                                            <span className="num truncate">
                                                {[property?.name, r.totalAmount ? `Total ${r.totalAmount}` : null, r.cancelledAt ? `Cancelled ${formatWhen(r.cancelledAt)}` : null]
                                                    .filter(Boolean).join(" · ")}
                                            </span>
                                        </span>
                                    </Link>
                                    {restoreButton(r)}
                                </li>
                            );
                        })}
                    </ul>

                    {/* Desktop: a table, easier to scan across columns. */}
                    <Card padding="none" className={`hidden transition-opacity lg:block ${isFetching ? "opacity-60" : ""}`}>
                        <table className="w-full text-left text-body-sm">
                            <caption className="sr-only">{summary}</caption>
                            <thead className="border-b border-subtle bg-surface-sunken text-caption text-subtle uppercase">
                                <tr>
                                    <th scope="col" className="px-5 py-3 font-semibold tracking-wide">Guest</th>
                                    <th scope="col" className="px-3 py-3 font-semibold tracking-wide">Stay</th>
                                    <th scope="col" className="px-3 py-3 font-semibold tracking-wide">Room</th>
                                    <th scope="col" className="px-3 py-3 font-semibold tracking-wide">Source</th>
                                    <th scope="col" className="px-3 py-3 text-right font-semibold tracking-wide">Total</th>
                                    <th scope="col" className="px-3 py-3 font-semibold tracking-wide">Cancelled</th>
                                    <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-subtle">
                                {items.map((r) => {
                                    const unit = unitById.get(r.unitId);
                                    const property = unit ? propertyById.get(unit.propertyId) : undefined;
                                    return (
                                        <tr key={r.id} className="transition-colors hover:bg-surface-hover">
                                            <td className="max-w-56 px-5 py-3">
                                                <Link to={`/dashboard/reservations/${r.id}`} className="block truncate font-semibold text-fg hover:text-primary hover:underline">
                                                    {r.guestName || "No guest name"}
                                                </Link>
                                            </td>
                                            <td className="num px-3 py-3 whitespace-nowrap text-fg">{formatStay(r.checkIn, r.checkOut)}</td>
                                            <td className="max-w-52 px-3 py-3">
                                                <span className="block truncate text-fg">{unit?.name ?? "—"}</span>
                                                {property && <span className="block truncate text-caption text-subtle">{property.name}</span>}
                                            </td>
                                            <td className="px-3 py-3"><SourceBadge source={r.source}/></td>
                                            <td className="num px-3 py-3 text-right text-fg">{r.totalAmount ? `${r.totalAmount}` : "—"}</td>
                                            <td className="num px-3 py-3 whitespace-nowrap text-muted">{r.cancelledAt ? formatWhen(r.cancelledAt) : "—"}</td>
                                            <td className="px-5 py-2 text-right">{restoreButton(r)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </Card>

                    {totalPages > 1 && (
                        <nav aria-label="Cancelled bookings pages" className="mt-4 flex items-center justify-between gap-3">
                            <Button variant="secondary" onClick={() => goTo(page - 1)} disabled={page === 0} icon={<ChevronLeftIcon size={16}/>}>
                                Previous
                            </Button>
                            <p className="num text-body-sm text-muted" aria-live="polite">
                                Page {page + 1} of {totalPages}
                            </p>
                            <Button variant="secondary" onClick={() => goTo(page + 1)} disabled={page >= totalPages - 1}>
                                Next
                                <ChevronRightIcon size={16}/>
                            </Button>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
