import {repriceForm, type PricingField} from "../lib/pricing.ts";
import axios from "axios";
import {errorMessage, fieldErrors, logError} from "../lib/errors";
import {Navigate, useParams, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    allReservationsQuery, createReservation, deleteReservation, eraseGuest, getReservation, restoreReservation,
    getReservations,
    type ReservationRequest,
    updateReservation
} from "../lib/api/reservations.ts";
import {allUnitsQuery, getUnit} from "../lib/api/units.ts";
import {useConnected} from "../lib/apiReachability";
import {useId, useState} from "react";

import FormTopBar from "../components/FormTopBar";
import MoveReservationDialog from "../components/MoveReservationDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import {useToast} from "../lib/toast";
import {formatStay} from "../lib/dates";
import StayDatesPicker from "../components/StayDatesPicker";
import {AlertCircleIcon, CheckIcon, TrashIcon} from "../components/icons";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import {TextAreaField, TextField} from "../components/ui/Field";
import Callout from "../components/ui/Callout";
import {Stepper} from "../components/ui/Controls";
import {SegmentedControl} from "../components/ui/Segmented";
import {FormSkeleton, RecordLoadError} from "../components/ui/States";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";
import {useReturnTo} from "../lib/useReturnTo";


const STATUS_OPTIONS = [
    {value: "CONFIRMED", label: "Confirm"},
    {value: "PAID", label: "Paid"},
    {value: "BLOCK", label: "Blocked"},
] as const;

type EditableStatus = (typeof STATUS_OPTIONS)[number]["value"];

const PRICE_MESSAGES = {rangeUnderflow: "Can't be negative.", badInput: "Enter a number, e.g. 45 or 45.50."};
const MESSAGES: ValidationMessages = {
    pricePerGuest: PRICE_MESSAGES,
    nightlyRate: PRICE_MESSAGES,
    totalAmount: PRICE_MESSAGES,
    guestEmail: {typeMismatch: "Enter an email address like name@example.com, or leave it empty."},
};

export default function ReservationFormPage() {
    const {id} = useParams();
    const isEditing = Boolean(id);
    const statusOptions = STATUS_OPTIONS;
    const toast = useToast();
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [confirmErase, setConfirmErase] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [copyOpen, setCopyOpen] = useState(false);
    const [datesMissing, setDatesMissing] = useState(false);
    // Back, Save and Cancel return to the page you came from (the calendar, the conflicts page, ...).
    const {goBack} = useReturnTo("/dashboard/calendar");
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const prefillUnitId = searchParams.get("unitId");
    const prefillCheckIn = searchParams.get("checkIn");
    const datesErrorId = useId();
    const {errors, validate, recheck, showServerErrors, otherErrors} = useInlineValidation(MESSAGES);

    // Offline, a booking opened from the calendar's saved copy starts from that copy (view only: Save is off).
    const connected = useConnected();
    const {data: existing, isLoading: isLoadingExisting, error: loadError, refetch, isRefetching} = useQuery({
        queryKey: ["reservations", "detail", id],
        queryFn: () => getReservation(id!),
        enabled: isEditing,
        initialData: () => connected ? undefined
            : queryClient.getQueryData(allReservationsQuery.queryKey)?.find((r) => r.id === id),
        initialDataUpdatedAt: () => queryClient.getQueryState(allReservationsQuery.queryKey)?.dataUpdatedAt,
    });
    const initialForm: ReservationRequest = {
        unitId: prefillUnitId ?? "",
        checkIn: prefillCheckIn ?? "",
        checkOut: "",
        status: "CONFIRMED",
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
        initialData: () => connected ? undefined
            : queryClient.getQueryData(allUnitsQuery.queryKey)?.find((u) => u.id === form.unitId),
        initialDataUpdatedAt: () => queryClient.getQueryState(allUnitsQuery.queryKey)?.dataUpdatedAt,
    });
    const {data: unitReservations} = useQuery({
        queryKey: ["reservations", "unit", form.unitId],
        queryFn: () => getReservations({unitId: form.unitId}),
        enabled: Boolean(form.unitId),
    });
    const bookedRanges = (unitReservations ?? [])
        .filter((r) => r.id !== id && r.status !== "CANCELLED")
        .map((r) => ({checkIn: r.checkIn, checkOut: r.checkOut}));
    const [conflictMessage, setConflictMessage] = useState<string | null>(null);
    const [lastEdited, setLastEdited] = useState<PricingField>(null);
    const mutation = useMutation({
        mutationFn: (data: ReservationRequest) =>
            isEditing ? updateReservation(id!, data) : createReservation(data),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["reservations"]});
            toast.show(isEditing ? "Booking saved." : "Booking added to the calendar.");
            goBack();
        },
        onError: (error) => {
            if (axios.isAxiosError(error) && error.response?.status === 409) {
                // Says which room and dates are taken, and what to do.
                setConflictMessage(errorMessage(error, "Couldn't save the booking."));
            } else {
                setConflictMessage(null);
            }
            const fields = fieldErrors(error);
            if (fields) showServerErrors(document.getElementById("reservation-form") as HTMLFormElement | null, fields);
        },
    });
    // Saves the form without leaving the page, for Move and Copy (they only use what is saved).
    const saveInPlaceMutation = useMutation({
        mutationFn: (data: ReservationRequest) => updateReservation(id!, data),
        onSuccess: async (_saved, data) => {
            setInitialSnapshot(data);
            await queryClient.invalidateQueries({queryKey: ["reservations"]});
            toast.show("Changes saved.");
        },
    });

    async function saveBeforeMoveOrCopy() {
        const formEl = document.getElementById("reservation-form") as HTMLFormElement | null;
        const datesOk = Boolean(form.checkIn && form.checkOut);
        if (!datesOk) setDatesMissing(true);
        // Invalid fields: close the dialog so the form shows what to fix.
        if (!formEl || !validate(formEl) || !datesOk) {
            setMoveOpen(false);
            setCopyOpen(false);
            return;
        }
        await saveInPlaceMutation.mutateAsync(form);
    }

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
                            .catch((err) => {
                                logError(err, "Undo cancel");
                                toast.show(errorMessage(err, "Couldn't restore the booking."), {tone: "error"});
                            });
                    },
                } : undefined,
            });
            goBack();
        },
    });
    const isCancelled = existing?.status === "CANCELLED";

    // GDPR erasure of this guest: the server keeps dates and amounts; the reloaded booking refills the form.
    const eraseMutation = useMutation({
        mutationFn: () => eraseGuest(id!),
        onSuccess: async (saved) => {
            setConfirmErase(false);
            queryClient.setQueryData(["reservations", "detail", id], saved);
            await queryClient.invalidateQueries({queryKey: ["reservations"]});
            toast.show("Guest details erased.");
        },
    });
    const hasGuestDetails = Boolean(existing && (existing.guestName || existing.guestEmail || existing.guestPhone || existing.notes));

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setConflictMessage(null);
        const fieldsValid = validate(e.currentTarget);
        // The date picker uses buttons, not inputs, so the browser's `required` can't catch this.
        if (!form.checkIn || !form.checkOut) {
            setDatesMissing(true);
            return;
        }
        if (!fieldsValid) return;
        mutation.mutate(form)
    }

    function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
        setForm({...form, [e.target.name]: e.target.value});
        recheck(e.target);
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
        toast.show("Total price was recalculated based on your changes.", {tone: "info"});
    }

    const title = isEditing
        ? `Edit ${unitForTitle ? ` ${unitForTitle.name}` : " reservation"}`
        : unitForTitle ? `Reservation ${unitForTitle.name}` : "New reservation";
    const isDirty = initialSnapshot !== null && JSON.stringify(form) !== JSON.stringify(initialSnapshot);
    const pricesLocked = !form.checkIn || !form.checkOut;

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

    const back = {to: "/dashboard/calendar"};

    if (isEditing && isLoadingExisting) {
        return (
            <div className="mx-auto max-w-2xl">
                <FormTopBar formId="reservation-form" saving={false} title={title} back={back}/>
                <FormSkeleton label="Loading booking..." sections={3}/>
            </div>
        );
    }

    if (isEditing && loadError && !existing) {
        return (
            <div className="mx-auto max-w-2xl">
                <FormTopBar formId="reservation-form" saving={false} title={title} back={back} hideSave/>
                <RecordLoadError what="booking" error={loadError} onRetry={() => refetch()} retrying={isRefetching} backTo="/dashboard/calendar"/>
            </div>
        );
    }

    const priceField = (name: "pricePerGuest" | "nightlyRate" | "totalAmount", label: string) => (
        <TextField
            label={label}
            id={name}
            name={name}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            enterKeyHint="next"
            value={form[name] ?? ""}
            onChange={(e) => {
                onChange(e);
                setLastEdited(name);
            }}
            disabled={pricesLocked}
            placeholder={pricesLocked ? "Pick dates" : ""}
            className="num min-w-0"
            error={errors[name]}
        />
    );

    const canCancel = Boolean(isEditing && existing && !isCancelled);
    const section = "space-y-4 p-4 sm:p-5";

    return (
        <div className="mx-auto max-w-2xl">
            <FormTopBar
                formId="reservation-form"
                saving={mutation.isPending}
                title={title}
                subtitle={existing?.guestName?.trim() || undefined}
                isDirty={isDirty}
                back={back}
                onDelete={canCancel ? () => {
                    cancelMutation.reset();
                    setConfirmCancel(true);
                } : undefined}
                deleteLabel="Cancel"
                onMove={canCancel ? () => setMoveOpen(true) : undefined}
                onCopy={canCancel ? () => setCopyOpen(true) : undefined}
                hideSave={form.status === "CANCELLED"}
            />

            <div className="space-y-4">
                {conflictMessage && (
                    <Callout tone="danger" role="alert">{conflictMessage}</Callout>
                )}
                {mutation.isError && !conflictMessage && (
                    <Callout tone="danger" role="alert">{otherErrors.length > 0 ? otherErrors.join(" ") : errorMessage(mutation.error, "Couldn't save the booking.")}</Callout>
                )}

                {existing?.priceNeedsReview && !isCancelled && (
                    <Callout tone="warning" role="alert" title="! Check the price.">
                        The dates of this booking were changed on {existing.source === "AIRBNB" ? "Airbnb" : "Booking.com"},
                        but the price (<span className="num">{existing.totalAmount}</span>) was left as you entered it. Update it if needed, then press Save.
                    </Callout>
                )}

                {isCancelled && (
                    <Callout tone="info">
                        This booking is cancelled. To put it back on the calendar, choose a status below and press Save.
                    </Callout>
                )}

                {/* One card; the sections are separated by divider lines. */}
                <form id="reservation-form" onSubmit={handleSubmit} noValidate>
                    <Card padding="none" className="divide-y divide-subtle">
                        <section aria-labelledby="stay-heading" className={section}>
                            <h2 id="stay-heading" className="text-title-3 text-fg">Stay</h2>
                            <div>
                                <StayDatesPicker
                                    checkIn={form.checkIn}
                                    checkOut={form.checkOut}
                                    bookedRanges={bookedRanges}
                                    invalid={datesMissing}
                                    describedBy={datesErrorId}
                                    onChange={(checkIn, checkOut) => {
                                        setForm((f) => ({...f, checkIn, checkOut}));
                                        setLastEdited("nightlyRate");
                                        setDatesMissing(false);
                                        showRecalculatedNotice(checkIn, checkOut);
                                    }}
                                />
                                {datesMissing && (
                                    <p id={datesErrorId} role="alert" className="field-error">
                                        <AlertCircleIcon className="mt-0.5"/>
                                        Pick a check-in and a check-out date.
                                    </p>
                                )}
                            </div>
                            <Stepper
                                label="Guests"
                                value={form.guestsCount}
                                onDecrement={() => updateGuests(-1)}
                                onIncrement={() => updateGuests(1)}
                                decrementDisabled={form.guestsCount <= 1}
                                decrementLabel="Decrease guests"
                                incrementLabel="Increase guests"
                            />
                        </section>

                        <section aria-labelledby="status-heading" className={section}>
                            <h2 id="status-heading" className="text-title-3 text-fg">Status</h2>
                            <SegmentedControl<EditableStatus>
                                name="status"
                                label="Status"
                                labelId="status-heading"
                                value={form.status as EditableStatus}
                                options={statusOptions.map((o) => ({
                                    ...o,
                                    icon: form.status === o.value ? <CheckIcon size={16} strokeWidth={2.5}/> : undefined,
                                }))}
                                onChange={(status) => setForm({...form, status})}
                            />
                        </section>

                        <section aria-labelledby="price-heading" className={section}>
                            <div>
                                <h2 id="price-heading" className="text-title-3 text-fg">Price</h2>
                                <p className="mt-0.5 text-body-sm text-muted">Enter any one field — the others calculate automatically.</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                {priceField("pricePerGuest", "Per guest")}
                                {priceField("nightlyRate", "Per night")}
                                {priceField("totalAmount", "Total")}
                            </div>
                        </section>

                        <section aria-labelledby="guest-heading" className={section}>
                            <h2 id="guest-heading" className="text-title-3 text-fg">Guest</h2>
                            <TextField label="Guest name" id="guestName" name="guestName" value={form.guestName} onChange={onChange}
                                       autoComplete="off" autoCapitalize="words" enterKeyHint="next"/>
                            <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                                <TextField label="Phone" type="tel" inputMode="tel" id="guestPhone" name="guestPhone"
                                           value={form.guestPhone} onChange={onChange} autoComplete="off" enterKeyHint="next"/>
                                <TextField label="Email" type="email" inputMode="email" id="guestEmail" name="guestEmail"
                                           value={form.guestEmail} onChange={onChange} autoComplete="off" autoCapitalize="none"
                                           spellCheck={false} enterKeyHint="next" error={errors.guestEmail}/>
                            </div>
                            <TextAreaField label="Notes" id="notes" name="notes" value={form.notes} onChange={onChange} rows={3}/>
                            {existing?.guestErasedAt && (
                                <p className="text-body-sm text-subtle">
                                    Guest details were erased on {new Date(existing.guestErasedAt).toLocaleDateString()}.
                                </p>
                            )}
                            {isEditing && hasGuestDetails && (
                                // Erasing reloads the booking, so it waits until nothing typed here is unsaved
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <Button variant="secondary" size="sm" icon={<TrashIcon size={16}/>}
                                            disabled={isDirty || !connected}
                                            onClick={() => {
                                                eraseMutation.reset();
                                                setConfirmErase(true);
                                            }}>
                                        Erase guest details
                                    </Button>
                                    {isDirty && <span className="text-caption text-subtle">Save or undo your changes first.</span>}
                                </div>
                            )}
                        </section>
                    </Card>
                </form>
            </div>

            {existing && (
                <MoveReservationDialog
                    open={moveOpen}
                    reservationId={existing.id}
                    currentRoom={unitForTitle?.name}
                    hasUnsavedChanges={isDirty}
                    onSaveChanges={saveBeforeMoveOrCopy}
                    onClose={() => setMoveOpen(false)}
                    onDone={(rooms) => {
                        setMoveOpen(false);
                        toast.show(`Booking moved to ${rooms[0]}.`);
                        goBack();
                    }}
                />
            )}
            {existing && (
                <MoveReservationDialog
                    mode="copy"
                    open={copyOpen}
                    reservationId={existing.id}
                    currentRoom={unitForTitle?.name}
                    hasUnsavedChanges={isDirty}
                    onSaveChanges={saveBeforeMoveOrCopy}
                    onClose={() => setCopyOpen(false)}
                    onDone={(rooms) => {
                        setCopyOpen(false);
                        toast.show(`Booking copied to ${rooms.join(", ")}.`);
                        goBack();
                    }}
                />
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
                error={cancelMutation.isError ? errorMessage(cancelMutation.error, "Couldn't cancel this booking.") : null}
                onConfirm={() => cancelMutation.mutate()}
                onCancel={() => setConfirmCancel(false)}
            />

            <ConfirmDialog
                open={confirmErase}
                title="Erase guest details?"
                message={
                    <>
                        The guest's name, email, phone and notes are removed from this booking for good. The dates,
                        room, status, number of guests and amounts stay for your records. Copies of this booking in
                        other rooms keep their own details.
                    </>
                }
                confirmLabel="Erase details"
                pendingLabel="Erasing…"
                cancelLabel="Keep details"
                pending={eraseMutation.isPending}
                error={eraseMutation.isError ? errorMessage(eraseMutation.error, "Couldn't erase the guest details.") : null}
                onConfirm={() => eraseMutation.mutate()}
                onCancel={() => setConfirmErase(false)}
            />
        </div>
    )
}
