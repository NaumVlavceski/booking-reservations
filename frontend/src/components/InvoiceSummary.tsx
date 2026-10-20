import type {ReactNode} from "react";
import {formatEarnings, type InvoiceTotals} from "../lib/api/invoices";
import {plural} from "../lib/plural";

interface InvoiceSummaryProps {
    label: ReactNode;
    /** e.g. "All time" or "1 Jan 2026 → 31 Mar 2026". */
    period: string;
    totals: InvoiceTotals;
    currency: string | null;
}

/**
 * The total at the bottom of an invoices screen. On phones it sticks just above the tab bar, so the number
 * stays in view while the list scrolls; from `sm` up it sits after the list.
 */
export default function InvoiceSummary({label, period, totals, currency}: InvoiceSummaryProps) {
    return (
        <section
            aria-label="Total"
            className="sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+0.5rem)] z-10 mt-4 rounded-2xl border border-subtle bg-surface-raised px-4 py-3 shadow-popover sm:static sm:px-5 sm:py-4 sm:shadow-card"
        >
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-overline text-subtle uppercase">{label}</p>
                    <p className="num truncate text-caption text-muted">{period}</p>
                </div>
                <p className="num shrink-0 text-title-1 text-fg">{formatEarnings(totals.earnings, currency)}</p>
            </div>
            <p className="num mt-1 text-body-sm text-muted">
                {plural(totals.totalDays, "day")} · {plural(totals.reservationCount, "booking")}
            </p>
        </section>
    );
}
