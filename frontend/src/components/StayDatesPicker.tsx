import {useMemo, useState} from "react";
import {DayPicker} from "react-day-picker";
import "react-day-picker/style.css";
import {addDays, differenceInCalendarDays, eachDayOfInterval, format} from "date-fns";
import {CalendarIcon} from "./icons";

interface BookedRange {
    checkIn: string;  // yyyy-MM-dd
    checkOut: string; // yyyy-MM-dd, exclusive — the checkout day itself is free
}

interface StayDatesPickerProps {
    checkIn: string;   // yyyy-MM-dd or ""
    checkOut: string;  // yyyy-MM-dd or ""
    onChange: (checkIn: string, checkOut: string) => void;
    invalid?: boolean;
    bookedRanges?: BookedRange[];
}

type Step = "checkIn" | "checkOut";

// "yyyy-MM-dd" via new Date() is UTC midnight — parse as local to avoid off-by-one days.
function parseLocalDate(value: string): Date {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
}

const toIso = (d: Date) => format(d, "yyyy-MM-dd");

export default function StayDatesPicker({checkIn, checkOut, onChange, invalid, bookedRanges = []}: StayDatesPickerProps) {
    const [step, setStep] = useState<Step | null>(null);
    const from = checkIn ? parseLocalDate(checkIn) : undefined;
    const to = checkOut ? parseLocalDate(checkOut) : undefined;
    const nights = from && to ? differenceInCalendarDays(to, from) : 0;

    // Every night already taken by another stay on this unit. Each range is
    // half-open [checkIn, checkOut) — the checkout day itself is a free
    // check-in day for the next booking, so it's not included here.
    const blockedDates = useMemo(() => {
        const dates = new Set<string>();
        for (const range of bookedRanges) {
            const rangeFrom = parseLocalDate(range.checkIn);
            const rangeTo = parseLocalDate(range.checkOut);
            if (differenceInCalendarDays(rangeTo, rangeFrom) <= 0) continue;
            for (const day of eachDayOfInterval({start: rangeFrom, end: addDays(rangeTo, -1)})) {
                dates.add(toIso(day));
            }
        }
        return dates;
    }, [bookedRanges]);

    function open(next: Step) {
        // Check-out is meaningless without a check-in to anchor it.
        setStep(next === "checkOut" && !from ? "checkIn" : next);
    }

    function handleDay(day: Date) {
        if (step === "checkIn") {
            // Keep the existing check-out only if it's still after the new check-in.
            const keepCheckOut = to && differenceInCalendarDays(to, day) > 0 ? checkOut : "";
            onChange(toIso(day), keepCheckOut);
            setStep("checkOut");
        } else if (step === "checkOut") {
            onChange(checkIn, toIso(day));
            setStep(null);
        }
    }

    // A checkout day is only pickable if none of the nights between the
    // chosen check-in and that day are already booked.
    function spansBookedNight(day: Date): boolean {
        if (!from) return false;
        if (differenceInCalendarDays(day, from) <= 0) return false;
        return eachDayOfInterval({start: from, end: addDays(day, -1)})
            .some((night) => blockedDates.has(toIso(night)));
    }

    const checkInDisabled = (day: Date) => blockedDates.has(toIso(day));
    const hasBookedNights = blockedDates.size > 0;
    const checkOutDisabled = (day: Date) => (from ? differenceInCalendarDays(day, from) <= 0 : false) || spansBookedNight(day);

    const fieldClass = (active: boolean) =>
        `field-input flex items-center justify-between gap-2 text-left ${
            active ? "border-teal-600 ring-4 ring-teal-600/15" : invalid ? "border-red-400" : ""
        }`;

    return (
        <div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <span className="field-label">Check-in</span>
                    <button type="button" className={fieldClass(step === "checkIn")} onClick={() => open("checkIn")}
                            aria-expanded={step === "checkIn"}>
                        <span className={from ? "text-slate-900" : "text-slate-400"}>
                            {from ? format(from, "EEE, d MMM") : "Add date"}
                        </span>
                        <CalendarIcon size={16} className="shrink-0 text-slate-400"/>
                    </button>
                </div>
                <div>
                    <span className="field-label">Check-out</span>
                    <button type="button" className={fieldClass(step === "checkOut")} onClick={() => open("checkOut")}
                            aria-expanded={step === "checkOut"}>
                        <span className={to ? "text-slate-900" : "text-slate-400"}>
                            {to ? format(to, "EEE, d MMM") : "Add date"}
                        </span>
                        <CalendarIcon size={16} className="shrink-0 text-slate-400"/>
                    </button>
                </div>
            </div>

            {nights > 0 && !step && (
                <p className="field-hint">
                    {nights} {nights === 1 ? "night" : "nights"} · {format(from!, "d MMM")} – {format(to!, "d MMM yyyy")}
                </p>
            )}

            {step && (
                <div className="rdp-theme mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between px-1 pb-1">
                        <p className="text-sm font-semibold text-slate-900">
                            {step === "checkIn" ? "Select check-in" : "Select check-out"}
                        </p>
                        {nights > 0 && (
                            <p className="text-xs font-medium text-slate-500">
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
                            modifiers={{booked: (day: Date) => blockedDates.has(toIso(day))}}
                            modifiersClassNames={{booked: "rdp-booked"}}
                        />
                    </div>
                    {hasBookedNights && (
                        <p className="flex items-center gap-2 px-1 pb-2 text-xs text-slate-600">
                            <span className="inline-block h-3 w-3 rounded-sm border border-red-300 bg-red-50"/>
                            Already booked
                            {step === "checkOut" && " · the stay can't run into another booking"}
                        </p>
                    )}
                    <div className="flex items-center justify-between border-t border-slate-100 px-1 pt-2">
                        <button type="button" className="text-sm font-semibold text-slate-500 hover:text-slate-800"
                                onClick={() => {
                                    onChange("", "");
                                    setStep("checkIn");
                                }}>
                            Clear
                        </button>
                        <button type="button" className="text-sm font-semibold text-teal-700"
                                onClick={() => setStep(null)}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
