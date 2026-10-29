import {queryOptions} from "@tanstack/react-query";
import {apiClient} from "./client.ts";
import type {PageResponse, ReservationResponse} from "./reservations.ts";

export interface InvoiceProperty {
    propertyId: string;
    propertyName: string;
    unitCount: number;
}

export interface InvoiceUnitEarnings {
    unitId: string;
    unitName: string;
    totalDays: number;
    earnings: number;
    reservationCount: number;
    reservationsWithoutAmount: number;
}

export interface InvoiceTotals {
    totalDays: number;
    earnings: number;
    reservationCount: number;
    reservationsWithoutAmount: number;
}

export interface InvoicePropertyUnits {
    propertyId: string;
    propertyName: string;
    units: InvoiceUnitEarnings[];
    grandTotal: InvoiceTotals;
    // Not part of the data model yet: null until the backend has one.
    currency: string | null;
}

export interface InvoiceReservation {
    reservationId: string;
    guestName: string | null;
    checkIn: string;
    checkOut: string;
    nights: number;
    status: ReservationResponse["status"];
    source: ReservationResponse["source"];
    totalAmount: number | null;
}

export interface InvoiceUnitReservations extends InvoiceTotals {
    unitId: string;
    unitName: string;
    propertyId: string;
    propertyName: string;
    currency: string | null;
    /** One page of bookings; the totals cover all of them. */
    reservations: PageResponse<InvoiceReservation>;
}

/** A confirmed / paid booking with no total: it counts as 0 in the earnings until one is filled in. */
export interface MissingAmountReservation extends Omit<InvoiceReservation, "totalAmount"> {
    unitId: string;
    unitName: string;
}

export interface InvoiceMissingAmounts {
    propertyId: string;
    propertyName: string;
    /** Set when the list is for one room only. */
    unitId: string | null;
    unitName: string | null;
    reservations: PageResponse<MissingAmountReservation>;
}

export async function getInvoiceProperties(): Promise<InvoiceProperty[]> {
    const res = await apiClient.get<InvoiceProperty[]>("/api/invoices/properties");
    return res.data;
}

export const invoicePropertiesQuery = queryOptions({
    queryKey: ["invoices", "properties"],
    queryFn: getInvoiceProperties,
});

/** What the invoices screens are narrowed to. "" means no restriction on that field. */
export interface InvoiceFilters {
    /** "yyyy-MM-dd" check-in bounds, inclusive. */
    from: string;
    to: string;
    /** Only CONFIRMED and PAID are ever invoiced. */
    status: "" | "CONFIRMED" | "PAID";
    source: "" | ReservationResponse["source"];
}

const filterParams = ({from, to, status, source}: InvoiceFilters) => ({
    from: from || undefined,
    to: to || undefined,
    status: status || undefined,
    source: source || undefined,
});

export async function getInvoicePropertyUnits(propertyId: string, range: InvoiceFilters): Promise<InvoicePropertyUnits> {
    const res = await apiClient.get<InvoicePropertyUnits>(`/api/invoices/properties/${propertyId}/units`, {params: filterParams(range)});
    return res.data;
}

export const invoicePropertyUnitsQuery = (propertyId: string, range: InvoiceFilters) => queryOptions({
    queryKey: ["invoices", "property", propertyId, range],
    queryFn: () => getInvoicePropertyUnits(propertyId, range),
});

/** Booking lists come 20 at a time; page numbers start at 0. */
export const INVOICE_PAGE_SIZE = 20;

export async function getInvoiceUnitReservations(unitId: string, range: InvoiceFilters, page: number): Promise<InvoiceUnitReservations> {
    const res = await apiClient.get<InvoiceUnitReservations>(`/api/invoices/units/${unitId}/reservations`,
        {params: {...filterParams(range), page, size: INVOICE_PAGE_SIZE}});
    return res.data;
}

export const invoiceUnitReservationsQuery = (unitId: string, range: InvoiceFilters, page: number) => queryOptions({
    queryKey: ["invoices", "unit", unitId, range, page],
    queryFn: () => getInvoiceUnitReservations(unitId, range, page),
});

export async function getInvoiceMissingAmounts(propertyId: string, unitId: string | null,
                                               range: InvoiceFilters, page: number): Promise<InvoiceMissingAmounts> {
    const res = await apiClient.get<InvoiceMissingAmounts>(`/api/invoices/properties/${propertyId}/missing-amounts`,
        {params: {...filterParams(range), unitId: unitId || undefined, page, size: INVOICE_PAGE_SIZE}});
    return res.data;
}

export const invoiceMissingAmountsQuery = (propertyId: string, unitId: string | null, range: InvoiceFilters, page: number) => queryOptions({
    queryKey: ["invoices", "missing-amounts", propertyId, unitId, range, page],
    queryFn: () => getInvoiceMissingAmounts(propertyId, unitId, range, page),
});

/** invoices_2026-10-01_2026-10-31.xlsx; the same names the backend gives, used if its header can't be read. */
function exportFilename({from, to}: InvoiceFilters): string {
    if (from && to) return `invoices_${from}_${to}.xlsx`;
    if (from) return `invoices_from_${from}.xlsx`;
    if (to) return `invoices_until_${to}.xlsx`;
    return "invoices_all-time.xlsx";
}

/**
 * Downloads every booking of a property (or one room) matching the filters as an Excel file. Fetched with the
 * session token like any other call, then handed to the browser as a file.
 */
export async function downloadInvoicesExcel(propertyId: string, unitId: string | null, range: InvoiceFilters): Promise<void> {
    const res = await apiClient.get<Blob>(`/api/invoices/properties/${propertyId}/export`,
        {params: {...filterParams(range), unitId: unitId || undefined}, responseType: "blob"});
    const disposition = String(res.headers["content-disposition"] ?? "");
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? exportFilename(range);

    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoke a little later: some browsers (Safari) read the file only after click() has returned.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const amountFormat = new Intl.NumberFormat(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

/** "1,250.50", followed by the currency code once the backend sends one. */
export function formatEarnings(amount: number, currency: string | null): string {
    return currency ? `${amountFormat.format(amount)} ${currency}` : amountFormat.format(amount);
}
