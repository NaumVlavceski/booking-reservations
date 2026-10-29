import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {useEffect} from "react";
import {isAxiosError} from "axios";
import {Link, useParams} from "react-router-dom";
import {formatEarnings, invoiceUnitReservationsQuery} from "../lib/api/invoices";
import {formatStay} from "../lib/dates";
import {plural} from "../lib/plural";
import {formatPeriod, useInvoiceFilters} from "../lib/useInvoiceFilters";
import {useFromHere} from "../lib/useReturnTo";
import {CalendarIcon, ChevronRightIcon} from "../components/icons";
import {SourceBadge, StatusBadge} from "../components/ReservationBadges";
import InvoiceExportButton from "../components/InvoiceExportButton";
import InvoiceFilters from "../components/InvoiceFilters";
import InvoiceSummary from "../components/InvoiceSummary";
import MissingAmountsCallout from "../components/MissingAmountsCallout";
import Pager from "../components/ui/Pager";
import PageHeader from "../components/ui/PageHeader";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";
import NotFoundPage from "./NotFoundPage";

/** Invoices, step 3: every confirmed or paid booking of one room, latest check-in first, with the room total. */
export default function InvoiceUnitPage() {
    const {unitId = ""} = useParams();
    const fromHere = useFromHere();
    const {range, invalid, activeCount, search, searchWith, setRange, page, setPage} = useInvoiceFilters();
    const {data, isLoading, isError, error, refetch, isRefetching, isPlaceholderData} = useQuery({
        ...invoiceUnitReservationsQuery(unitId, range, page),
        enabled: !invalid,
        placeholderData: keepPreviousData,
    });
    const totalPages = data?.reservations.totalPages ?? 0;

    // A page past the end (bookings changed since, or a hand-edited URL): step back to the last one.
    useEffect(() => {
        if (data && !isPlaceholderData && page > 0 && page >= totalPages) setPage(Math.max(totalPages - 1, 0));
    }, [data, isPlaceholderData, page, totalPages, setPage]);

    if (isError && isAxiosError(error) && error.response?.status === 404) return <NotFoundPage/>;

    return (
        <div>
            <PageHeader
                title={data?.unitName ?? "Invoices"}
                description={data?.propertyName}
                back={{to: data ? `/dashboard/invoices/properties/${data.propertyId}${search}` : "/dashboard/invoices"}}
                alerts={false}
            />
            <InvoiceFilters
                range={range} invalid={invalid} activeCount={activeCount} onChange={setRange}
                actions={data && (
                    <InvoiceExportButton propertyId={data.propertyId} unitId={data.unitId} range={range}
                                      disabled={invalid || data.reservationCount === 0}/>
                )}
            />

            {invalid ? null : isLoading ? (
                <ListSkeleton rows={4} label="Loading bookings..."/>
            ) : isError || !data ? (
                <ErrorState title="Couldn't load bookings" onRetry={() => refetch()} retrying={isRefetching}>
                    Try refreshing the page.
                </ErrorState>
            ) : (
                <div className={`transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
                    <MissingAmountsCallout
                        count={data.reservationsWithoutAmount}
                        to={`/dashboard/invoices/properties/${data.propertyId}/missing-amounts${searchWith({unitId: data.unitId})}`}
                    />

                    {data.reservations.totalElements === 0 ? (
                        <EmptyState icon={<CalendarIcon size={24}/>}
                                    title={activeCount > 0 ? "No bookings match these filters" : "No confirmed or paid bookings"}>
                            Cancelled and blocked dates are not counted.
                        </EmptyState>
                    ) : (
                        <>
                            <h2 className="mb-2 px-1 text-overline text-subtle uppercase">{plural(data.reservations.totalElements, "booking")}</h2>
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
                                                    {r.totalAmount === null ? (
                                                        <span className="shrink-0 text-body-sm font-semibold text-warning">No amount</span>
                                                    ) : (
                                                        <span className="num shrink-0 text-title-3 text-fg">
                                                            {formatEarnings(r.totalAmount, data.currency)}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="num block text-body-sm text-muted">
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
                        </>
                    )}

                    <InvoiceSummary label="Total, this room" period={formatPeriod(range)} totals={data}
                                    currency={data.currency}/>
                </div>
            )}
        </div>
    );
}
