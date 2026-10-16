import {SOURCE_LABEL, STATUS_LABEL, type ReservationSource, type ReservationStatus} from "../lib/sources";
import {CheckIcon} from "./icons";

const SOURCE_STYLE: Record<ReservationSource, { box: string; glyph: string; mark: string }> = {
    BOOKING: {box: "src-badge src-badge--booking", glyph: "bg-src-booking-fg text-src-booking-fill", mark: "B"},
    AIRBNB: {box: "src-badge src-badge--airbnb", glyph: "bg-src-airbnb-fg text-src-airbnb-fill", mark: "A"},
    DIRECT: {box: "src-badge src-badge--direct", glyph: "bg-src-direct-fg text-src-direct-fill", mark: "D"},
};

/**
 * Where a booking came from, in the calendar's colours *and* with a letter, texture and its name —
 * never colour alone.
 */
export function SourceBadge({source, className = ""}: { source: ReservationSource; className?: string }) {
    const style = SOURCE_STYLE[source] ?? SOURCE_STYLE.DIRECT;
    return (
        <span className={`${style.box} ${className}`}>
            <span aria-hidden="true" className={`flex size-[1.125rem] items-center justify-center rounded-full text-[0.625rem] leading-none font-extrabold ${style.glyph}`}>
                {style.mark}
            </span>
            {SOURCE_LABEL[source] ?? source}
        </span>
    );
}

/** Confirmed / Paid / Blocked / Cancelled, styled like the calendar bar it matches. */
export function StatusBadge({status, className = ""}: { status: ReservationStatus; className?: string }) {
    const box = status === "PAID" ? "src-badge src-badge--paid"
        : status === "BLOCK" ? "src-badge src-badge--blocked"
            : "src-badge src-badge--neutral";
    return (
        <span className={`${box} ${className}`}>
            {status === "PAID" && <CheckIcon size={14} strokeWidth={2.5}/>}
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}
