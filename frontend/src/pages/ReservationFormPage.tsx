import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    createReservation, getReservation,
    type ReservationRequest,
    updateReservation
} from "../lib/api/reservations.ts";
import {useEffect, useRef, useState} from "react";

import FormTopBar from "../components/FormTopBar";
import StayDatesPicker from "../components/StayDatesPicker";

type PricingField = "nightlyRate" | "totalAmount" | "pricePerGuest" | null;

const STATUS_OPTIONS = [
    {value: "CONFIRMED", label: "Confirmed"},
    {value: "PAID", label: "Paid"},
    {value: "CANCELLED", label: "Cancelled"},
    {value: "BLOCK", label: "Blocked"},
] as const;

export default function ReservationFormPage() {
    const {id} = useParams();
    const isEditing = Boolean(id);
    // Cancelling (which deletes the booking) only makes sense for one that already exists.
    const statusOptions = isEditing ? STATUS_OPTIONS : STATUS_OPTIONS.filter((o) => o.value !== "CANCELLED");
    const [datesMissing, setDatesMissing] = useState(false);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const prefillUnitId = searchParams.get("unitId");
    const prefillCheckIn = searchParams.get("checkIn");

    const {data: existing} = useQuery({
        queryKey: ["reservations", "detail", id],
        queryFn: () => getReservation(id!),
        enabled: isEditing,
    });
    const [form, setForm] = useState<ReservationRequest>({
        unitId: prefillUnitId ?? "",
        checkIn: prefillCheckIn ?? "",
        checkOut: "",
        status:"CONFIRMED",
        pricePerGuest: null,
        nightlyRate: null,
        totalAmount: null,
        guestName: "",
        guestEmail: "",
        guestPhone: "",
        guestsCount: 2,
        notes: ""
    });
    useEffect(() => {
        if (existing) {
            setForm({
                unitId: existing.unitId,
                checkIn: existing.checkIn,
                checkOut: existing.checkOut,
                status: existing.status,
                pricePerGuest: existing.pricePerGuest,
                nightlyRate: existing.nightlyRate,
                totalAmount: existing.totalAmount,
                guestName: existing.guestName,
                guestEmail: existing.guestEmail!,
                guestPhone: existing.guestPhone!,
                guestsCount: existing.guestsCount,
                notes: existing.notes
            })
        }
    }, [existing]);
    const [conflictMessage, setConflictMessage] = useState<string | null>(null);
    const [lastEdited, setLastEdited] = useState<PricingField>(null);
    const [priceRecalculatedNotice, setPriceRecalculatedNotice] = useState(false);
    const noticeTimerRef = useRef<number | undefined>(undefined);
    const mutation = useMutation({
        mutationFn: (data: ReservationRequest) =>
            isEditing ? updateReservation(id!, data) : createReservation(data),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["reservations"]});
            navigate("/dashboard/calendar")
        },
        onError: (error: any) => {
            if (error.response?.status === 409) {
                setConflictMessage(error.response.data?.message ?? "These dates are no longer available.");
            } else {
                setConflictMessage(null);
            }
        },
    });
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setConflictMessage(null);
        // The date picker uses buttons, not inputs, so the browser's `required` can't catch this.
        if (!form.checkIn || !form.checkOut) {
            setDatesMissing(true);
            return;
        }
        mutation.mutate(form)
    }

    function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
        setForm({...form, [e.target.name]: e.target.value});
    }

    useEffect(() => {
        if (!form.checkIn || !form.checkOut) return;
        const nights = Math.round(
            (new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (nights <= 0) return;
        if (lastEdited === "nightlyRate" && form.nightlyRate) {
            const rate = Number(form.nightlyRate);
            if (!isNaN(rate)) {
                setForm((f) => ({
                    ...f, totalAmount: Number((rate * nights).toFixed(2)),
                    pricePerGuest: Number((rate / form.guestsCount).toFixed(2)),
                }));
            }
        } else if (lastEdited === "totalAmount" && form.totalAmount) {
            const total = Number(form.totalAmount);
            if (!isNaN(total)) {
                setForm((f) => ({
                    ...f, nightlyRate: Number((total / nights).toFixed(2)),
                    pricePerGuest: Number((total / nights / form.guestsCount).toFixed(2)),
                }));
            }
        } else if (lastEdited === "pricePerGuest" && form.pricePerGuest) {
            const perGuest = Number(form.pricePerGuest);
            if (!isNaN(perGuest)) {
                setForm((f) => ({
                    ...f, nightlyRate: Number((perGuest * form.guestsCount).toFixed(2)),
                    totalAmount: Number((perGuest * nights * form.guestsCount).toFixed(2)),
                }));
            }
        }
    }, [form.checkIn, form.checkOut, form.nightlyRate, form.pricePerGuest, form.guestsCount, form.totalAmount, lastEdited]);
    // Called from the date picker and the guests field only. It used to be an
    // effect watching those fields, which also fired when an existing
    // reservation's values were loaded into the form — so the notice showed
    // every time you opened a reservation to edit it.
    function showRecalculatedNotice(checkIn: string, checkOut: string) {
        const hasPrice = Boolean(form.nightlyRate || form.totalAmount || form.pricePerGuest);
        // Prices are only recalculated once both dates are set.
        if (!hasPrice || !checkIn || !checkOut) return;
        setPriceRecalculatedNotice(true);
        window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => setPriceRecalculatedNotice(false), 3000);
    }

    useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

    const inputClass = "field-input";
    const labelClass = "field-label";

    return (
        <div className="mx-auto max-w-xl">
            <FormTopBar
                formId="reservation-form"
                saving={mutation.isPending}
                back={{to: "/dashboard/calendar", label: "Calendar"}}
            />

            {conflictMessage && (
                <div className="alert-error mb-4">
                    {conflictMessage}
                </div>
            )}
            {mutation.isError && !conflictMessage && (
                <p className="alert-error mb-4">Something went wrong. Check your details and try again.</p>
            )}

            {priceRecalculatedNotice && (
                <div className="alert-info mb-4">
                    <span>Total price was recalculated based on your changes.</span>
                    <button
                        type="button"
                        onClick={() => setPriceRecalculatedNotice(false)}
                        className="text-blue-500 hover:text-blue-700 font-bold ml-3"
                    >
                        ×
                    </button>
                </div>
            )}
            <form id="reservation-form" onSubmit={handleSubmit} className="surface space-y-5">
                <div>
                    <StayDatesPicker
                        checkIn={form.checkIn}
                        checkOut={form.checkOut}
                        invalid={datesMissing}
                        onChange={(checkIn, checkOut) => {
                            setForm((f) => ({...f, checkIn, checkOut}));
                            setLastEdited("nightlyRate");
                            setDatesMissing(false);
                            showRecalculatedNotice(checkIn, checkOut);
                        }}
                    />
                    {datesMissing && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">Pick a check-in and a check-out date.</p>
                    )}
                </div>
                <div>
                    <label className={labelClass}>Guests</label>
                    <input
                        type="number"
                        min={1}
                        name="guestsCount"
                        value={form.guestsCount}
                        onChange={(e) => {
                            onChange(e);
                            setLastEdited("pricePerGuest");
                            showRecalculatedNotice(form.checkIn, form.checkOut);
                        }}
                        required
                        className={`${inputClass} max-w-[8rem]`}
                    />
                </div>
                <div>
                    <label className={`${labelClass} mb-2`}>Status</label>
                    <div className={`grid gap-2 ${statusOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {statusOptions.map((option) => (
                            <label
                                key={option.value}
                                className={`flex items-center gap-2 border rounded-xl px-3.5 py-2.5 cursor-pointer text-sm font-semibold transition-colors ${
                                    form.status === option.value
                                        ? "border-teal-600 bg-teal-50 text-teal-700"
                                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="status"
                                    value={option.value}
                                    checked={form.status === option.value}
                                    onChange={onChange}
                                    className="accent-teal-700"
                                />
                                {option.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div>
                        <label className={labelClass}>
                            <span className="sm:hidden">Per guest</span>
                            <span className="hidden sm:inline">Price/guest</span>
                        </label>
                        <input
                            type="number"
                            name="pricePerGuest"
                            value={form.pricePerGuest ?? ""}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("pricePerGuest");
                            }}
                            disabled={!form.checkIn || !form.checkOut}
                            placeholder={!form.checkIn || !form.checkOut ? "Pick dates" : ""}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>
                            <span className="sm:hidden">Nightly</span>
                            <span className="hidden sm:inline">Nightly rate</span>
                        </label>
                        <input
                            type="number"
                            name="nightlyRate"
                            value={form.nightlyRate ?? ""}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("nightlyRate");
                            }}
                            disabled={!form.checkIn || !form.checkOut}
                            placeholder={!form.checkIn || !form.checkOut ? "Pick dates" : ""}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>
                            Total
                        </label>
                        <input
                            type="number"
                            name="totalAmount"
                            value={form.totalAmount ?? ""}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("totalAmount");
                            }}
                            disabled={!form.checkIn || !form.checkOut}
                            placeholder={!form.checkIn || !form.checkOut ? "Pick dates" : ""}
                            className={inputClass}
                        />
                    </div>
                </div>
                <p className="text-xs text-slate-400 -mt-2">
                    Enter any one field — the others calculate automatically.
                </p>

                <div>
                    <label className={labelClass}>Guest name</label>
                    <input
                        name="guestName"
                        value={form.guestName}
                        onChange={onChange}
                        className={inputClass}
                    />
                </div>

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
                    <div>
                        <label className={labelClass}>Email</label>
                        <input
                            type="email"
                            name="guestEmail"
                            value={form.guestEmail}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Phone</label>
                        <input
                            type="tel"
                            name="guestPhone"
                            value={form.guestPhone}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </div>
                </div>

                <div>
                    <label className={labelClass}>Notes</label>
                    <textarea
                        name="notes"
                        value={form.notes}
                        onChange={onChange}
                        rows={2}
                        className={inputClass}
                    />
                </div>

            </form>
        </div>
    )
}
