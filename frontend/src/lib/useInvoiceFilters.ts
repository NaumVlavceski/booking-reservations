import {format, subMonths} from "date-fns";
import {useSearchParams} from "react-router-dom";
import type {InvoiceFilters} from "./api/invoices";
import {parseLocalDate} from "./dates";

const STATUSES = ["CONFIRMED", "PAID"] as const;
const SOURCES = ["DIRECT", "BOOKING", "AIRBNB"] as const;
const FILTER_KEYS = ["from", "to", "status", "source"] as const;

const day = (value: string) => format(parseLocalDate(value), "d MMM yyyy");

/** "1 Jan 2026 → 31 Mar 2026", "From 1 Jan 2026", "Until 31 Mar 2026", or "All time". */
export function formatPeriod({from, to}: Pick<InvoiceFilters, "from" | "to">): string {
    if (from && to) return `${day(from)} → ${day(to)}`;
    if (from) return `From ${day(from)}`;
    if (to) return `Until ${day(to)}`;
    return "All time";
}

/**
 * The invoices filters (dates, status, source; the last month by default) live in the URL, e.g. ?from=2026-01-01&status=PAID,
 * so they survive a reload, can be shared, and follow you from a property into its rooms and lists.
 */
export function useInvoiceFilters() {
    const [params, setParams] = useSearchParams();
    const status = params.get("status");
    const source = params.get("source");
    // No dates in the URL at all: start with the last month (one month ago → today). Clearing the dates
    // is remembered as dates=all, so "all time" stays all time instead of jumping back to the default.
    const datesChosen = params.has("from") || params.has("to") || params.get("dates") === "all";
    const today = new Date();
    const range: InvoiceFilters = {
        from: datesChosen ? params.get("from") ?? "" : format(subMonths(today, 1), "yyyy-MM-dd"),
        to: datesChosen ? params.get("to") ?? "" : format(today, "yyyy-MM-dd"),
        // Unknown values in a hand-edited URL count as "no filter".
        status: STATUSES.find((s) => s === status) ?? "",
        source: SOURCES.find((s) => s === source) ?? "",
    };
    // ISO dates compare correctly as plain strings.
    const invalid = range.from !== "" && range.to !== "" && range.from > range.to;
    // Dates count as one filter.
    const activeCount = (range.from || range.to ? 1 : 0) + (range.status ? 1 : 0) + (range.source ? 1 : 0);

    /** The current filters as a query string for a link to the next screen, plus any extra params. */
    function searchWith(extra: Record<string, string> = {}): string {
        const next = new URLSearchParams();
        for (const key of FILTER_KEYS) if (range[key]) next.set(key, range[key]);
        if (!range.from && !range.to) next.set("dates", "all");
        for (const [key, value] of Object.entries(extra)) if (value) next.set(key, value);
        return next.toString() ? `?${next.toString()}` : "";
    }

    function setRange(next: Partial<InvoiceFilters>) {
        setParams((prev) => {
            const merged = new URLSearchParams(prev);
            // Pin the dates on screen into the URL first, so changing only status/source keeps the default month.
            if (!merged.has("from") && !merged.has("to") && merged.get("dates") !== "all") {
                if (range.from) merged.set("from", range.from);
                if (range.to) merged.set("to", range.to);
            }
            for (const [key, value] of Object.entries(next)) {
                if (value) merged.set(key, value);
                else merged.delete(key);
            }
            if (merged.has("from") || merged.has("to")) merged.delete("dates");
            else merged.set("dates", "all");
            // New filters, new results: start again from the first page.
            merged.delete("page");
            return merged;
        }, {replace: true});
    }

    // The booking lists are paged. The URL shows ?page=2 for the second page; the API counts from 0.
    const page = Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1) - 1;

    function setPage(next: number) {
        setParams((prev) => {
            const merged = new URLSearchParams(prev);
            if (next > 0) merged.set("page", String(next + 1));
            else merged.delete("page");
            return merged;
        }, {replace: true}); // replace: the header's back goes to the previous screen, not the previous page
        window.scrollTo({top: 0, behavior: "smooth"});
    }

    return {range, invalid, activeCount, search: searchWith(), searchWith, setRange, page, setPage};
}
