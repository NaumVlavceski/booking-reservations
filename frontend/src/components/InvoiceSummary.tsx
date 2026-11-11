import type {ReactNode} from "react";
import type {InvoiceTotals} from "../lib/api/invoices";
import {plural} from "../lib/plural";
import {AnimatedAmount} from "./AnimatedFigures";

interface InvoiceSummaryProps {
    label: ReactNode;
    /** e.g. "All time" or "1 Jan 2026 → 31 Mar 2026". */
    period: string;
    totals: InvoiceTotals;
    currency: string | null;
}

/**
 * The total at the bottom of an invoices screen: what it covers on the left (label, period, days and
 * bookings), and the amount large on the right, counting up from zero when it appears.
 */
export default function InvoiceSummary({label, period, totals, currency}: InvoiceSummaryProps) {
    return (
        <section
            aria-label="Total"
            className="mt-4 flex items-center justify-between gap-4 rounded-card border border-subtle bg-surface-raised px-4 py-6 shadow-card sm:px-5 sm:py-5"
        >
            <div className="min-w-0">
                <p className="text-label text-fg">{label}</p>
                <p className="num truncate text-caption text-muted">{period}</p>
                <p className="num text-caption text-muted">
                    {plural(totals.totalDays, "day")} · {plural(totals.reservationCount, "booking")}
                </p>
            </div>
            <AnimatedAmount value={totals.earnings} currency={currency} className="shrink-0 text-right text-figure text-fg"/>
        </section>
    );
}
