import {useEffect, useId, useRef, useState} from "react";
import {DayPicker} from "react-day-picker";
import {format} from "date-fns";
import {parseLocalDate} from "../lib/dates";
import {CalendarIcon, CloseIcon} from "./icons";

interface DateFilterProps {
    label: string;
    /** "yyyy-MM-dd", or "" for no date. */
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

/**
 * A single-date field that opens the same popover calendar as the calendar page's "Jump to date",
 * instead of the browser's native date input.
 */
export default function DateFilter({label, value, onChange, placeholder = "Any date"}: DateFilterProps) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const selected = value ? parseLocalDate(value) : undefined;

    useEffect(() => {
        if (!open) return;

        function onPointerDownOutside(e: PointerEvent) {
            if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
        }

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }

        document.addEventListener("pointerdown", onPointerDownOutside);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDownOutside);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    function handleSelect(date: Date | undefined) {
        // Clicking the chosen day again deselects it in react-day-picker: treat that as "no date"
        onChange(date ? format(date, "yyyy-MM-dd") : "");
        setOpen(false);
    }

    return (
        <div ref={anchorRef} className="relative">
            <label className="field-label" htmlFor={id}>{label}</label>
            <div className="relative">
                <button
                    id={id}
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    className="field-input flex items-center gap-2 pr-10 text-left"
                >
                    <CalendarIcon size={18} className="shrink-0 text-slate-500"/>
                    <span className={`min-w-0 truncate ${selected ? "text-slate-900" : "text-slate-400"}`}>
                        {selected ? format(selected, "d MMM yyyy") : placeholder}
                    </span>
                </button>
                {selected && (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        aria-label={`Clear ${label.toLowerCase()}`}
                        className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-4 focus-visible:ring-teal-600/20 focus-visible:outline-none"
                    >
                        <CloseIcon size={16}/>
                    </button>
                )}
            </div>

            {open && (
                <div
                    role="dialog"
                    aria-label={label}
                    className="rdp-theme absolute top-full right-0 z-20 mt-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                >
                    <DayPicker
                        mode="single"
                        selected={selected}
                        onSelect={handleSelect}
                        defaultMonth={selected ?? new Date()}
                        autoFocus
                    />
                </div>
            )}
        </div>
    );
}
