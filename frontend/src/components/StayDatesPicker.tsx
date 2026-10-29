import {useId, useMemo, useState} from "react";
import {DayPicker} from "react-day-picker";
import "react-day-picker/style.css";
import {differenceInCalendarDays, format} from "date-fns";
import {blockedNights, canCheckOutOn, showAsBooked, type BookedRange, type PickStep} from "../lib/stayDates";
import {parseLocalDate} from "../lib/dates";
import {dayButtonLabel} from "../lib/dayPickerLabels";
import {ArrowRightIcon, CalendarIcon} from "./icons";

interface StayDatesPickerProps {
    checkIn: string;   // yyyy-MM-dd or ""
    checkOut: string;  // yyyy-MM-dd or ""
    onChange: (checkIn: string, checkOut: string) => void;
    invalid?: boolean;
    bookedRanges?: BookedRange[];
    /** id of an error message to tie to both date fields. */
    describedBy?: string;
    /**
     * "stay" (default): a booking, at least one night, "N nights" shown.
     * "period": a filter range "from – to": the same day is allowed, no night count, empty reads "Any date".
     */
    mode?: "stay" | "period";
    labels?: { checkIn: string; checkOut: string };
}

type Step = PickStep;

const toIso = (d: Date) => format(d, "yyyy-MM-dd");

export default function StayDatesPicker({
    checkIn, checkOut, onChange, invalid, bookedRanges = [], describedBy, mode = "stay",
    labels = {checkIn: "Check-in", checkOut: "Check-out"},
}: StayDatesPickerProps) {
    const period = mode === "period";
    const [step, setStep] = useState<Step | null>(null);
    const ids = useId();
    const from = checkIn ? parseLocalDate(checkIn) : undefined;
    const to = checkOut ? parseLocalDate(checkOut) : undefined;
    const nights = !period && from && to ? differenceInCalendarDays(to, from) : 0;

    // Every night already taken by another stay on this unit (the check-out day itself is free).
    const blockedDates = useMemo(() => blockedNights(bookedRanges), [bookedRanges]);

    function open(next: Step) {
        // Check-out is meaningless without a check-in to anchor it.
        setStep(next === "checkOut" && !from ? "checkIn" : next);
    }

    function handleDay(day: Date) {
        if (step === "checkIn") {
            // Keep the existing check-out only if it's still after the new check-in.
            const keepCheckOut = to && differenceInCalendarDays(to, day) >= (period ? 0 : 1) ? checkOut : "";
            onChange(toIso(day), keepCheckOut);
            setStep("checkOut");
        } else if (step === "checkOut") {
            onChange(checkIn, toIso(day));
            setStep(null);
        }
    }

    const checkInDisabled = (day: Date) => showAsBooked(day, "checkIn", undefined, blockedDates);
    const hasBookedNights = blockedDates.size > 0;
    // A check-out day is only pickable if none of the nights between the chosen check-in and that day are booked
    const checkOutDisabled = (day: Date) =>
        period ? Boolean(from) && differenceInCalendarDays(day, from!) < 0 : !canCheckOutOn(day, from, blockedDates);

    const fieldClass = (active: boolean, empty: boolean) =>
        `field-input flex items-center justify-between gap-2 text-left ${empty ? "text-subtle" : "text-fg"} ${
            active ? "border-primary ring-1 ring-primary" : invalid && empty ? "border-danger ring-1 ring-danger" : ""
        }`;

    const field = (which: Step, label: string, date: Date | undefined) => (
        <div className={`float-field is-floated ${period ? "float-field--raised" : ""} ${step === which ? "is-active" : ""}`}>
            <button
                type="button"
                className={fieldClass(step === which, !date)}
                onClick={() => open(which)}
                aria-expanded={step === which}
                aria-controls={step ? `${ids}-panel` : undefined}
                aria-labelledby={`${ids}-${which}-label ${ids}-${which}-value`}
                aria-invalid={invalid && !date ? true : undefined}
                aria-describedby={invalid && !date ? describedBy : undefined}
            >
                <span id={`${ids}-${which}-value`} className="truncate">
                    {date ? format(date, period ? "d MMM yyyy" : "EEE, d MMM") : period ? "Any date" : "Add date"}
                </span>
                <CalendarIcon size={18} className="shrink-0 text-subtle"/>
            </button>
            <span id={`${ids}-${which}-label`} className="float-label">{label}</span>
        </div>
    );

    return (
        <div>
            {period ? (
                // A filter reads as one range: From → To.
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                    {field("checkIn", labels.checkIn, from)}
                    <ArrowRightIcon size={18} className="text-subtle"/>
                    {field("checkOut", labels.checkOut, to)}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    {field("checkIn", labels.checkIn, from)}
                    {field("checkOut", labels.checkOut, to)}
                </div>
            )}

            {nights > 0 && !step && (
                <p className="field-hint num">
                    {nights} {nights === 1 ? "night" : "nights"}
                </p>
            )}

            {step && (
                <div id={`${ids}-panel`} className="rdp-theme mt-3 animate-pop-in rounded-2xl border border-subtle bg-surface-raised p-2 shadow-popover sm:p-3">
                    <div className="flex items-center justify-between px-2 pt-1">
                        <p aria-live="polite" className="text-title-3 text-fg">
                            {period
                                ? `Pick the "${step === "checkIn" ? labels.checkIn : labels.checkOut}" date`
                                : step === "checkIn" ? "Select check-in" : "Select check-out"}
                        </p>
                        {nights > 0 && (
                            <p className="num text-caption text-subtle">
                                {nights} {nights === 1 ? "night" : "nights"}
                            </p>
                        )}
                    </div>
                    <div className="flex justify-center">
                        <DayPicker
                            // Remount per step so the visible month jumps to the relevant date.
                            key={step}
                            mode="range"
                            selected={from ? {from, to} : undefined}
                            onSelect={(_range, day) => handleDay(day)}
                            defaultMonth={(step === "checkOut" ? to ?? from : from) ?? new Date()}
                            // A stay needs at least one night: nothing on or before check-in,
                            // and nothing that would overlap another booking's nights.
                            disabled={step === "checkOut" ? checkOutDisabled : checkInDisabled}
                            weekStartsOn={1}
                            showOutsideDays
                            modifiers={{booked: (day: Date) => showAsBooked(day, step, from, blockedDates)}}
                            modifiersClassNames={{booked: "rdp-booked"}}
                            labels={{labelDayButton: dayButtonLabel}}
                        />
                    </div>
                    {hasBookedNights && (
                        <p className="flex items-center gap-2 px-2 pb-2 text-caption text-muted">
                            <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-danger-line bg-danger-soft text-[0.625rem] leading-none text-danger line-through">8</span>
                            Already booked
                            {step === "checkOut" && " · the stay can't run into another booking"}
                        </p>
                    )}
                    <div className="flex items-center justify-between border-t border-subtle px-1 pt-2">
                        <button type="button" className="btn btn-quiet"
                                onClick={() => {
                                    onChange("", "");
                                    setStep("checkIn");
                                }}>
                            Clear
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setStep(null)}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
