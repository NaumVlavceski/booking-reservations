import {useState} from "react";
import type {InvoiceFilters as Filters} from "../lib/api/invoices";
import {formatPeriod} from "../lib/useInvoiceFilters";
import {SOURCE_LABEL, STATUS_LABEL} from "../lib/sources";
import StayDatesPicker from "./StayDatesPicker";
import {CloseIcon, FilterIcon} from "./icons";
import Button from "./ui/Button";
import {SegmentedControl} from "./ui/Segmented";
import Sheet from "./ui/Sheet";

interface InvoiceFiltersProps {
    range: Filters;
    invalid: boolean;
    activeCount: number;
    onChange: (next: Partial<Filters>) => void;
}

const STATUS_OPTIONS = [
    {value: "", label: "All"},
    {value: "CONFIRMED", label: "Confirmed"},
    {value: "PAID", label: "Paid"},
] as const;

const SOURCE_OPTIONS = [
    {value: "", label: "All"},
    {value: "DIRECT", label: "Direct"},
    {value: "BOOKING", label: "Booking"},
    // {value: "AIRBNB", label: "Airbnb"},
] as const;

const CLEARED: Filters = {from: "", to: "", status: "", source: ""};

/**
 * A compact filter row for the invoices screens: one "Filters" button that opens a sheet (dates From → To,
 * status, source), and the active filters as chips you can remove one by one. Changes apply straight away.
 */
export default function InvoiceFilters({range, invalid, activeCount, onChange}: InvoiceFiltersProps) {
    const [open, setOpen] = useState(false);
    const hasDates = range.from !== "" || range.to !== "";

    return (
        <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" className="min-h-10" icon={<FilterIcon size={18}/>}
                        onClick={() => setOpen(true)} aria-haspopup="dialog">
                    Filters
                    {activeCount > 0 && (
                        <span className="num ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold text-on-primary">
                            {activeCount}
                        </span>
                    )}
                </Button>
                {activeCount === 0 && <span className="text-body-sm text-muted">All bookings, all time</span>}
                {hasDates && (
                    <Chip label={formatPeriod(range)} onRemove={() => onChange({from: "", to: ""})} removeLabel="Remove date filter"/>
                )}
                {range.status && (
                    <Chip label={STATUS_LABEL[range.status]} onRemove={() => onChange({status: ""})} removeLabel="Remove status filter"/>
                )}
                {range.source && (
                    <Chip label={SOURCE_LABEL[range.source]} onRemove={() => onChange({source: ""})} removeLabel="Remove source filter"/>
                )}
            </div>
            {invalid && <p role="alert" className="field-error">"From" must be on or before "To".</p>}

            <Sheet
                open={open}
                onClose={() => setOpen(false)}
                title="Filters"
                description="Bookings checking in within these dates."
                showClose
                size="md"
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <Button variant="ghost" onClick={() => onChange(CLEARED)} disabled={activeCount === 0}>
                            Clear all
                        </Button>
                        <Button onClick={() => setOpen(false)}>Show results</Button>
                    </div>
                }
            >
                <div className="space-y-5">
                    <StayDatesPicker
                        mode="period"
                        labels={{checkIn: "From", checkOut: "To"}}
                        checkIn={range.from}
                        checkOut={range.to}
                        onChange={(from, to) => onChange({from, to})}
                    />
                    <div className="space-y-1.5">
                        <p id="invoice-status-label" className="text-body-sm font-semibold text-fg">Status</p>
                        <SegmentedControl name="invoice-status" label="Status" labelId="invoice-status-label"
                                          value={range.status} options={STATUS_OPTIONS}
                                          onChange={(status) => onChange({status})}/>
                    </div>
                    <div className="space-y-1.5">
                        <p id="invoice-source-label" className="text-body-sm font-semibold text-fg">Source</p>
                        <SegmentedControl name="invoice-source" label="Source" labelId="invoice-source-label"
                                          value={range.source} options={SOURCE_OPTIONS}
                                          onChange={(source) => onChange({source})}/>
                    </div>
                </div>
            </Sheet>
        </div>
    );
}

function Chip({label, onRemove, removeLabel}: { label: string; onRemove: () => void; removeLabel: string }) {
    return (
        <span className="inline-flex min-h-10 items-center gap-1 rounded-full border border-primary-line bg-primary-soft pr-1 pl-3 text-body-sm font-semibold text-on-primary-soft">
            <span className="num">{label}</span>
            <button type="button" onClick={onRemove} aria-label={removeLabel}
                    className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--rt-border)]">
                <CloseIcon size={14}/>
            </button>
        </span>
    );
}
