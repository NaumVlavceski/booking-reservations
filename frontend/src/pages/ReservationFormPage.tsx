import {repriceForm, type PricingField} from "../lib/pricing.ts";
import axios from "axios";
import {apiErrorMessage} from "../lib/api/client";
import {Navigate, useNavigate, useParams, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    createReservation, deleteReservation, getReservation, restoreReservation,
    getReservations,
    type ReservationRequest,
    updateReservation
} from "../lib/api/reservations.ts";
import {getUnit} from "../lib/api/units.ts";
import {useEffect, useRef, useState} from "react";

import FormTopBar from "../components/FormTopBar";
import ConfirmDialog from "../components/ConfirmDialog";
import {useToast} from "../lib/toast";
import {formatStay} from "../lib/dates";
import StayDatesPicker from "../components/StayDatesPicker";
import {MinusIcon, PlusIcon} from "../components/icons";


const STATUS_OPTIONS = [
    {value: "CONFIRMED", label: "Confirmed"},
    {value: "PAID", label: "Paid"},
    {value: "BLOCK", label: "Blocked"},
] as const;

export default function ReservationFormPage() {
    const {id} = useParams();
    const isEditing = Boolean(id);
    // Cancelling (which deletes the booking) only makes sense for one that already exists.
    const statusOptions = STATUS_OPTIONS;
    const toast = useToast();
    const [confirmCancel, setConfirmCancel] = useState(false);
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
    const initialForm: ReservationRequest = {
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
    };
    const [form, setForm] = useState<ReservationRequest>(initialForm);
    // Snapshot to compare against for the unsaved-changes warning: the
    // prefilled/blank form on create, or the loaded reservation once it arrives.
    const [initialSnapshot, setInitialSnapshot] = useState<ReservationRequest | null>(isEditing ? null : initialForm);
    // Load the reservation into the form once per fetch result (render-time sync, not an effect).
    const [syncedExisting, setSyncedExisting] = useState<typeof existing>();
    if (existing && existing !== syncedExisting) {
        const next: ReservationRequest = {
            unitId: existing.unitId,
            checkIn: existing.checkIn,
            checkOut: existing.checkOut,
            status: existing.status,
            pricePerGuest: existing.pricePerGuest,
            nightlyRate: existing.nightlyRate,
            totalAmount: existing.totalAmount,
            guestName: existing.guestName ?? "",
            guestEmail: existing.guestEmail ?? "",
            guestPhone: existing.guestPhone ?? "",
            guestsCount: existing.guestsCount,
            notes: existing.notes ?? ""
        };
        setSyncedExisting(existing);
        setForm(next);
        setInitialSnapshot(next);
    }
    const {data: unitForTitle} = useQuery({
        queryKey: ["units", "detail", form.unitId],
        queryFn: () => getUnit(form.unitId),
        enabled: Boolean(form.unitId),
    });
    const {data: unitReservations} = useQuery({
        queryKey: ["reservations", "unit", form.unitId],
        queryFn: () => getReservations({unitId: form.unitId}),
        enabled: Boolean(form.unitId),
    });
    // Nights already taken by another stay on this unit. Checkout day itself
    // isn't blocked — it's a valid check-in day for the next booking.
    const bookedRanges = (unitReservations ?? [])
        .filter((r) => r.id !== id && r.status !== "CANCELLED")
        .map((r) => ({checkIn: r.checkIn, checkOut: r.checkOut}));
    const [conflictMessage, setConflictMessage] = useState<string | null>(null);
    const [lastEdited, setLastEdited] = useState<PricingField>(null);
    const [priceRecalculatedNotice, setPriceRecalculatedNotice] = useState(false);
    const noticeTimerRef = useRef<number | undefined>(undefined);
    const mutation = useMutation({
        mutationFn: (data: ReservationRequest) =>
            isEditing ? updateReservation(id!, data) : createReservation(data),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["reservations"]});
            toast.show(isEditing ? "Booking saved." : "Booking added to the calendar.");
            navigate("/dashboard/calendar")
        },
        onError: (error) => {
            if (axios.isAxiosError(error) && error.response?.status === 409) {
                setConflictMessage(`${apiErrorMessage(error, "These dates are no longer available.")} Pick different dates, or choose another room on the calendar.`);
            } else {
                setConflictMessage(null);
            }
        },
    });
    const cancelMutation = useMutation({
        mutationFn: () => deleteReservation(id!),
        onSuccess: async () => {
            setConfirmCancel(false);
            await queryClient.invalidateQueries({queryKey: ["reservations"]});
            const snapshot = existing;
            toast.show("Booking cancelled. The dates are free again.", {
                action: snapshot ? {
                    label: "Undo",
                    onClick: () => {
                        restoreReservation(snapshot, snapshot.status)
                            .then(() => {
                                queryClient.invalidateQueries({queryKey: ["reservations"]});
                                toast.show("Booking restored.");
                            })
                            .catch((err) => toast.show(apiErrorMessage(err, "Couldn't restore the booking."), {tone: "error"}));
                    },
                } : undefined,
            });
            navigate("/dashboard/calendar");
        },
    });
    const isCancelled = existing?.status === "CANCELLED";

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

    // Keep the other two price fields in step with the one the user edited last.
    // Applied during render (no effect) and only when a value actually changes,
    // so it settles after one extra pass.
    const repriced = repriceForm(form, lastEdited);
    if (repriced !== form) setForm(repriced);
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
    const title = isEditing
        ? `Edit${unitForTitle ? ` ${unitForTitle.name}` : " reservation"}`
        : unitForTitle ? `Reservation ${unitForTitle.name}` : "New reservation";
    const isDirty = initialSnapshot !== null && JSON.stringify(form) !== JSON.stringify(initialSnapshot);

    function updateGuests(delta: number) {
        setForm((f) => {
            const guestsCount = Math.max(1, f.guestsCount + delta);
            return {...f, guestsCount};
        });
        setLastEdited("pricePerGuest");
        showRecalculatedNotice(form.checkIn, form.checkOut);
    }

    // A new reservation needs a room, which comes from the calendar cell that was clicked.
    if (!isEditing && !prefillUnitId) return <Navigate to="/dashboard/calendar" replace/>;

    return (
        <div className="mx-auto max-w-xl">
            <FormTopBar
                formId="reservation-form"
                saving={mutation.isPending}
                title={title}
                isDirty={isDirty}
                back={{to: "/dashboard/calendar", label: "Calendar"}}
            />

            {conflictMessage && (
                <div className="alert-error mb-4">
                    {conflictMessage}
                </div>
            )}
            {mutation.isError && !conflictMessage && (
                <p className="alert-error mb-4">{apiErrorMessage(mutation.error, "Something went wrong. Check your details and try again.")}</p>
            )}

            {isCancelled && (
                <div className="alert-info mb-4">
                    This booking is cancelled. To put it back on the calendar, choose a status below and press Save.
                </div>
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
                        bookedRanges={bookedRanges}
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
                    <span className={labelClass}>Guests</span>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => updateGuests(-1)}
                            disabled={form.guestsCount <= 1}
                            aria-label="Decrease guests"
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                        >
                            <MinusIcon size={16}/>
                        </button>
                        <span className="w-8 text-center text-base font-semibold text-slate-900">
                            {form.guestsCount}
                        </span>
                        <button
                            type="button"
                            onClick={() => updateGuests(1)}
                            aria-label="Increase guests"
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            <PlusIcon size={16}/>
                        </button>
                    </div>
                </div>
                <div>
                    <span className={`${labelClass} mb-2`}>Status</span>
                    <div className="grid grid-cols-3 gap-2">
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
                        <label className={labelClass} htmlFor="pricePerGuest">
                            <span className="sm:hidden">Per guest</span>
                            <span className="hidden sm:inline">Per guest</span>
                        </label>
                        <input
                            id="pricePerGuest"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
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
                        <label className={labelClass} htmlFor="nightlyRate">
                            <span className="sm:hidden">Per day</span>
                            <span className="hidden sm:inline">Per night</span>
                        </label>
                        <input
                            id="nightlyRate"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
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
                        <label className={labelClass} htmlFor="totalAmount">
                            Total
                        </label>
                        <input
                            id="totalAmount"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
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
                <p className="field-hint -mt-2">
                    Enter any one field — the others calculate automatically.
                </p>

                <div>
                    <label className={labelClass} htmlFor="guestName">Guest name</label>
                    <input
                        id="guestName"
                        name="guestName"
                        value={form.guestName}
                        onChange={onChange}
                        className={inputClass}
                    />
                </div>

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
                    <div>
                        <label className={labelClass} htmlFor="guestPhone">Phone</label>
                        <input
                            type="tel"
                            id="guestPhone"
                        name="guestPhone"
                            value={form.guestPhone}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="guestEmail">Email</label>
                        <input
                            type="email"
                            id="guestEmail"
                        name="guestEmail"
                            value={form.guestEmail}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </div>
                </div>

                <div>
                    <label className={labelClass} htmlFor="notes">Notes</label>
                    <textarea
                        id="notes"
                        name="notes"
                        value={form.notes}
                        onChange={onChange}
                        rows={2}
                        className={inputClass}
                    />
                </div>

            </form>

            {isEditing && existing && !isCancelled && (
                <div className="mt-6 border-t border-slate-200 pt-4 sm:border-0 sm:pt-0">
                    <button
                        type="button"
                        onClick={() => {
                            cancelMutation.reset();
                            setConfirmCancel(true);
                        }}
                        className="btn btn-danger-ghost min-h-11 w-full sm:w-auto"
                    >
                        Cancel this booking
                    </button>
                </div>
            )}

            <ConfirmDialog
                open={confirmCancel}
                title={`Cancel ${existing?.guestName?.trim() || "this booking"}?`}
                message={existing && (
                    <>
                        {formatStay(existing.checkIn, existing.checkOut)}
                        {unitForTitle && ` · ${unitForTitle.name}`}. The dates become free for new bookings. You can
                        restore it later from <strong>Cancelled bookings</strong>.
                    </>
                )}
                confirmLabel="Cancel booking"
                pendingLabel="Cancelling…"
                cancelLabel="Keep booking"
                pending={cancelMutation.isPending}
                error={cancelMutation.isError ? apiErrorMessage(cancelMutation.error, "Couldn't cancel this booking.") : null}
                onConfirm={() => cancelMutation.mutate()}
                onCancel={() => setConfirmCancel(false)}
            />
        </div>
    )
}
