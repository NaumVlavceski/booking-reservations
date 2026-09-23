// src/components/DateRangePicker.tsx
import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { format } from "date-fns";

interface DateRangePickerProps {
    checkIn: string;
    checkOut: string;
    onChange: (checkIn: string, checkOut: string) => void;
}

function isValidDate(d: Date) {
    return !isNaN(d.getTime());
}

export default function DateRangePicker({ checkIn, checkOut, onChange }: DateRangePickerProps) {
    const [isOpen, setIsOpen] = useState(false);

    // Draft selection lives here, separate from the committed form state,
    // so canceling (clicking outside / not confirming) never touches the real form.
    const [draft, setDraft] = useState<DateRange | undefined>(undefined);

    const checkInDate = checkIn ? new Date(checkIn) : null;
    const checkOutDate = checkOut ? new Date(checkOut) : null;

    function handleOpen() {
        // Seed the draft from whatever's already committed, so reopening
        // to adjust an existing range starts from the current selection.
        setDraft(
            checkInDate && isValidDate(checkInDate) && checkOutDate && isValidDate(checkOutDate)
                ? { from: checkInDate, to: checkOutDate }
                : undefined
        );
        setIsOpen(true);
    }

    function handleConfirm() {
        if (draft?.from && draft?.to) {
            onChange(format(draft.from, "yyyy-MM-dd"), format(draft.to, "yyyy-MM-dd"));
        }
        setIsOpen(false);
    }

    function handleCancel() {
        setDraft(undefined);
        setIsOpen(false);
    }

    const label =
        checkInDate && isValidDate(checkInDate) && checkOutDate && isValidDate(checkOutDate)
            ? `${format(checkInDate, "MMM d, yyyy")} → ${format(checkOutDate, "MMM d, yyyy")}`
            : "Select check-in and check-out dates";

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => (isOpen ? handleCancel() : handleOpen())}
                className="w-full border rounded px-3 py-2 text-left"
            >
                {label}
            </button>

            {isOpen && (
                <div className="absolute z-10 mt-1 bg-white border rounded-lg shadow-lg p-3">
                    <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {draft?.from && draft?.to
                  ? `${format(draft.from, "MMM d")} → ${format(draft.to, "MMM d")}`
                  : draft?.from
                      ? "Pick check-out date"
                      : "Pick check-in date"}
            </span>
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="text-gray-400 hover:text-gray-700 font-bold text-lg leading-none"
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>

                    <DayPicker
                        mode="range"
                        selected={draft}
                        onSelect={setDraft}
                        disabled={{ before: new Date() }}
                        numberOfMonths={2}
                    />

                    <div className="flex justify-end mt-2">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!draft?.from || !draft?.to}
                            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                        >
                            Save dates
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}