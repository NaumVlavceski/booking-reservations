import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {isAxiosError} from "axios";
import {Link, useParams} from "react-router-dom";
import {formatEarnings, invoicePropertiesQuery, invoicePropertyUnitsQuery} from "../lib/api/invoices";
import {formatPeriod, useInvoiceFilters} from "../lib/useInvoiceFilters";
import {plural} from "../lib/plural";
import {BedIcon, ChevronRightIcon} from "../components/icons";
import InvoiceFilters from "../components/InvoiceFilters";
import InvoiceSummary from "../components/InvoiceSummary";
import MissingAmountsCallout from "../components/MissingAmountsCallout";
import PageHeader from "../components/ui/PageHeader";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";
import NotFoundPage from "./NotFoundPage";

/** Invoices, step 2: the rooms of one property with their days and earnings, and the property total at the bottom. */
export default function InvoicePropertyPage() {
    const {propertyId = ""} = useParams();
    const {range, invalid, activeCount, search, setRange} = useInvoiceFilters();
    const {data, isLoading, isError, error, refetch, isRefetching, isPlaceholderData} = useQuery({
        ...invoicePropertyUnitsQuery(propertyId, range),
        enabled: !invalid,
        placeholderData: keepPreviousData, // keep the old numbers on screen while new filters load
    });
    const {data: properties} = useQuery(invoicePropertiesQuery);

    if (isError && isAxiosError(error) && error.response?.status === 404) return <NotFoundPage/>;

    // One property: the property list is skipped, so back from here leaves Invoices altogether.
    const backTo = properties && properties.length > 1 ? "/dashboard/invoices" : "/dashboard/calendar";
    const total = data?.grandTotal.earnings ?? 0;

    return (
        <div>
            <PageHeader title={data?.propertyName ?? "Invoices"} back={{to: backTo}} alerts={false}/>
            <InvoiceFilters range={range} invalid={invalid} activeCount={activeCount} onChange={setRange}/>

            {invalid ? null : isLoading ? (
                <ListSkeleton rows={3} label="Loading earnings..."/>
            ) : isError || !data ? (
                <ErrorState title="Couldn't load earnings" onRetry={() => refetch()} retrying={isRefetching}>
                    Try refreshing the page.
                </ErrorState>
            ) : data.units.length === 0 ? (
                <EmptyState icon={<BedIcon size={24}/>} title="No rooms yet">
                    Add rooms to this property to see their earnings here.
                </EmptyState>
            ) : (
                <div className={`transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
                    <MissingAmountsCallout
                        count={data.grandTotal.reservationsWithoutAmount}
                        to={`/dashboard/invoices/properties/${data.propertyId}/missing-amounts${search}`}
                    />

                    <h2 className="mb-2 px-1 text-overline text-subtle uppercase">{plural(data.units.length, "room")}</h2>
                    <ul className="stack-list">
                        {data.units.map((unit) => {
                            // Each room's share of the property total, as a thin bar under its name.
                            const share = total > 0 ? Math.round((unit.earnings / total) * 100) : 0;
                            return (
                                <li key={unit.unitId} className="transition-colors hover:bg-surface-hover">
                                    <Link
                                        to={`/dashboard/invoices/units/${unit.unitId}${search}`}
                                        className="flex items-center gap-3 py-3.5 pr-3 pl-4 sm:gap-4 sm:pl-5"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-3">
                                                <span className="truncate text-title-3 text-fg">{unit.unitName}</span>
                                                <span className="num shrink-0 text-title-3 text-fg">
                                                    {formatEarnings(unit.earnings, data.currency)}
                                                </span>
                                            </span>
                                            <span className="num mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-subtle">
                                                <span>{plural(unit.totalDays, "day")} · {plural(unit.reservationCount, "booking")}</span>
                                                {unit.reservationsWithoutAmount > 0 && (
                                                    <span className="font-semibold text-warning">
                                                        {unit.reservationsWithoutAmount} without amount
                                                    </span>
                                                )}
                                            </span>
                                            <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                                                <span className="block h-full rounded-full bg-primary" style={{width: `${share}%`}}/>
                                            </span>
                                        </span>
                                        <ChevronRightIcon size={20} className="shrink-0 text-subtle"/>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    <InvoiceSummary label="Total, all rooms" period={formatPeriod(range)} totals={data.grandTotal}
                                    currency={data.currency}/>
                </div>
            )}
        </div>
    );
}
