import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {useEffect} from "react";
import {isAxiosError} from "axios";
import {Link, useParams, useSearchParams} from "react-router-dom";
import {invoiceMissingAmountsQuery} from "../lib/api/invoices";
import {formatStay} from "../lib/dates";
import {plural} from "../lib/plural";
import {useInvoiceFilters} from "../lib/useInvoiceFilters";
import {useFromHere} from "../lib/useReturnTo";
import {CheckCircleIcon, ChevronRightIcon} from "../components/icons";
import {SourceBadge, StatusBadge} from "../components/ReservationBadges";
import InvoiceFilters from "../components/InvoiceFilters";
import Pager from "../components/ui/Pager";
import PageHeader from "../components/ui/PageHeader";
import {EmptyState, ErrorState, ListSkeleton, RefreshFailed} from "../components/ui/States";
import NotFoundPage from "./NotFoundPage";

/**
 * Invoices: the confirmed / paid bookings that have no total amount (they count as 0 in the earnings), for a
 * property or one of its rooms. Tapping one opens it so the amount can be filled in; coming back refreshes the list.
 */
export default function InvoiceMissingAmountsPage() {
    const {propertyId = ""} = useParams();
    const [params] = useSearchParams();
    const unitId = params.get("unitId");
    const fromHere = useFromHere();
    const {range, invalid, activeCount, searchWith, setRange, page, setPage} = useInvoiceFilters();
    const {data, isLoading, isError, error, refetch, isRefetching, isPlaceholderData} = useQuery({
        ...invoiceMissingAmountsQuery(propertyId, unitId, range, page),
        enabled: !invalid,
        placeholderData: keepPreviousData,
    });
    const totalPages = data?.reservations.totalPages ?? 0;

    // Filling in amounts shrinks this list, so the page you were on can disappear: step back to the last one.
    useEffect(() => {
        if (data && !isPlaceholderData && page > 0 && page >= totalPages) setPage(Math.max(totalPages - 1, 0));
    }, [data, isPlaceholderData, page, totalPages, setPage]);

    if (isError && isAxiosError(error) && error.response?.status === 404) return <NotFoundPage/>;

    const backTo = unitId
        ? `/dashboard/invoices/units/${unitId}${searchWith()}`
        : `/dashboard/invoices/properties/${propertyId}${searchWith()}`;
    const where = data ? (data.unitName ? `${data.unitName} · ${data.propertyName}` : data.propertyName) : undefined;

    return (
        <div>
            <PageHeader title="Bookings without amount" description={where} back={{to: backTo}} alerts={false}/>
            <InvoiceFilters range={range} invalid={invalid} activeCount={activeCount} onChange={setRange}/>

            {invalid ? null : isLoading ? (
                <ListSkeleton rows={4} label="Loading bookings..."/>
            ) : !data ? (
                <ErrorState title="Couldn't load bookings" error={error} onRetry={() => refetch()} retrying={isRefetching}/>
            ) : data.reservations.totalElements === 0 ? (
                <EmptyState icon={<CheckCircleIcon size={24}/>} title="Every booking has an amount">
                    Nothing is counted as 0 for these filters.
                </EmptyState>
            ) : (
                <div className={`transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
                    {isError && <RefreshFailed error={error} onRetry={() => refetch()} retrying={isRefetching} className="mb-4"/>}
                    <p className="mb-3 px-1 text-body-sm text-muted">
                        {plural(data.reservations.totalElements, "booking")} counted as 0. Tap one to add its total.
                    </p>
                    <ul className="stack-list">
                        {data.reservations.items.map((r) => (
                            <li key={r.reservationId} className="transition-colors hover:bg-surface-hover">
                                <Link
                                    to={`/dashboard/reservations/${r.reservationId}`}
                                    state={fromHere}
                                    className="flex items-center gap-3 py-3.5 pr-3 pl-4 sm:gap-4 sm:pl-5"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-3">
                                            <span className="truncate text-title-3 text-fg">{r.guestName || "Guest"}</span>
                                            <span className="shrink-0 text-body-sm font-semibold text-warning">Add amount</span>
                                        </span>
                                        <span className="num block text-body-sm text-muted">
                                            {!data.unitId && <>{r.unitName} · </>}
                                            {formatStay(r.checkIn, r.checkOut)} · {plural(r.nights, "night")}
                                        </span>
                                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            <StatusBadge status={r.status}/>
                                            <SourceBadge source={r.source}/>
                                        </span>
                                    </span>
                                    <ChevronRightIcon size={20} className="shrink-0 text-subtle"/>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <Pager page={page} totalPages={totalPages} onChange={setPage} label="Bookings pages"/>
                </div>
            )}
        </div>
    );
}
