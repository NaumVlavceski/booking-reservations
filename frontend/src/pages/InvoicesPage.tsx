import {useQuery} from "@tanstack/react-query";
import {Link, Navigate} from "react-router-dom";
import {invoicePropertiesQuery} from "../lib/api/invoices";
import {plural} from "../lib/plural";
import {ChevronRightIcon, HouseIcon} from "../components/icons";
import PageHeader from "../components/ui/PageHeader";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    return (words[0]?.[0] ?? "").concat(words[1]?.[0] ?? "").toUpperCase();
}

/** Invoices, step 1: pick a property. With only one property there is nothing to pick, so skip ahead. */
export default function InvoicesPage() {
    const {data: properties, isLoading, isError, refetch, isRefetching} = useQuery(invoicePropertiesQuery);

    if (properties?.length === 1) {
        return <Navigate to={`/dashboard/invoices/properties/${properties[0].propertyId}`} replace/>;
    }

    return (
        <div>
            <PageHeader title="Invoices" description="Earnings from confirmed and paid bookings. Pick a property."
                        back={{to: "/dashboard/calendar"}}/>

            {isLoading ? (
                <ListSkeleton rows={3} label="Loading properties..."/>
            ) : isError ? (
                <ErrorState title="Couldn't load invoices" onRetry={() => refetch()} retrying={isRefetching}>
                    Try refreshing the page.
                </ErrorState>
            ) : !properties || properties.length === 0 ? (
                <EmptyState icon={<HouseIcon size={24}/>} title="No properties yet">
                    Add a property and some bookings to see your earnings here.
                </EmptyState>
            ) : (
                <ul className="stack-list">
                    {properties.map((property) => (
                        <li key={property.propertyId} className="transition-colors hover:bg-surface-hover">
                            <Link
                                to={`/dashboard/invoices/properties/${property.propertyId}`}
                                className="flex items-center gap-3 py-3.5 pr-3 pl-4 sm:gap-4 sm:pl-5"
                            >
                                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-body-sm font-bold text-on-primary-soft">
                                    {initials(property.propertyName)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-title-3 text-fg">{property.propertyName}</span>
                                    <span className="num block text-caption text-subtle">{plural(property.unitCount, "room")}</span>
                                </span>
                                <ChevronRightIcon size={20} className="shrink-0 text-subtle"/>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
