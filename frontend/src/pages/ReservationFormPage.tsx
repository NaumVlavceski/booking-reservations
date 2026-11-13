import {repriceForm, stayNights, type PricingField} from "../lib/pricing.ts";
import axios from "axios";
import {errorMessage, fieldErrors, logError} from "../lib/errors";
import {Navigate, useLocation, useParams, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    allReservationsQuery, createReservation, deleteReservation, getReservation, restoreReservation,
    getReservations,
    type ReservationRequest,
    updateReservation
} from "../lib/api/reservations.ts";
import {allUnitsQuery, getUnit} from "../lib/api/units.ts";
import {useConnected} from "../lib/apiReachability";
import {useEffect, useId, useState} from "react";
import {bookingLabel, guestNameOf} from "../lib/bookingLabel";
import {PLATFORM_NAME} from "../lib/syncErrors";
import {clearFormDraft, readFormDraft, setCurrentFormDraft, stashFormDraft} from "../lib/formDraft";

import FormTopBar from "../components/FormTopBar";
import MoveReservationDialog from "../components/MoveReservationDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import {useToast} from "../lib/toast";
import {formatStay} from "../lib/dates";
import StayDatesPicker from "../components/StayDatesPicker";
import {AlertCircleIcon, CheckIcon} from "../components/icons";
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

/** The size of reservation.notes. */
const MAX_NOTES_LENGTH = 255;
/** The notes field starts counting characters from here. */
const NOTES_COUNTER_FROM = 200;
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
    const [moveOpen, setMoveOpen] = useState(false);
    const [copyOpen, setCopyOpen] = useState(false);
    const [datesMissing, setDatesMissing] = useState(false);
    // Back, Save and Cancel return to the page you came from (the calendar, the conflicts page, ...).
    const {goBack} = useReturnTo("/dashboard/calendar");
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const prefillUnitId = searchParams.get("unitId");
    const prefillCheckIn = searchParams.get("checkIn");
    const {pathname, search} = useLocation();
    // What was being typed here when the session ended, if anything (lib/formDraft.ts)
    const [draft] = useState(() => readFormDraft<ReservationRequest>(pathname + search));
    const datesErrorId = useId();
    const {errors, validate, recheck, setError, showServerErrors, otherErrors} = useInlineValidation(MESSAGES);

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
    const [form, setForm] = useState<ReservationRequest>(draft ?? initialForm);
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
            guestName: guestNameOf(existing),
            guestEmail: existing.guestEmail ?? "",
            guestPhone: existing.guestPhone ?? "",
            guestsCount: existing.guestsCount,
            notes: existing.notes ?? ""
        };
        setForm(draft && syncedExisting === undefined ? draft : next);
        setSyncedExisting(existing);
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
    // How many nights the price was last worked out for (null: as loaded)
    const [pricedNights, setPricedNights] = useState<number | null>(null);
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
        if (form.notes.length > MAX_NOTES_LENGTH) {
            setError("notes", `Notes can be up to ${MAX_NOTES_LENGTH} characters. This has ${form.notes.length}.`);
            const notes = document.getElementById("notes");
            notes?.focus({preventScroll: true});
            notes?.scrollIntoView({block: "center"}); // clear of the Save bar, with its message in view
            return;
        }
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

    /** New dates only change the price if the number of nights changed, and then by the rate per night. */
    function repriceForDates(checkIn: string, checkOut: string) {
        const nights = stayNights(checkIn, checkOut);
        if (nights === 0) return;
        const before = pricedNights ?? (initialSnapshot ? stayNights(initialSnapshot.checkIn, initialSnapshot.checkOut) : 0);
        setPricedNights(nights);
        if (nights === before) return;
        if (form.nightlyRate) {
            setLastEdited("nightlyRate");
            showRecalculatedNotice(checkIn, checkOut);
        } else if (form.totalAmount) {
            setLastEdited("totalAmount");
        }
    }

    // A draft is restored once; what is on screen is then kept like any other typing. While editing, the current
    // values are what would be put aside if the session ended.
    useEffect(() => {
        clearFormDraft(); // Also one that belongs to another account: it must not stay in this tab
        if (!draft) return;
        toast.show("We kept what you typed. Check it and press Save.", {tone: "info"});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        setCurrentFormDraft(isDirty ? form : null);
        return () => setCurrentFormDraft(null);
    }, [form, isDirty]);
    // A refresh (or the browser reloading the page) keeps unsaved changes too: they are put aside as the page unloads
    // and restored above with the same "We kept what you typed" note. This tab only (sessionStorage), never sent anywhere.
    useEffect(() => {
        const keep = () => stashFormDraft(window.location.pathname + window.location.search);
        window.addEventListener("pagehide", keep);
        return () => window.removeEventListener("pagehide", keep);
    }, []);

    // A new reservation needs a room, which comes from the calendar cell that was clicked.
    if (!isEditing && !prefillUnitId) return <Navigate to="/dashboard/calendar" replace/>;

    const back = {to: "/dashboard/calendar"};

    if (isEditing && isLoadingExisting) {
        return (
            <div className="mx-auto max-w-2xl">
                <FormTopBar formId="reservation-form" saving={false} title={title} back={back}/>
                <FormSkeleton label="Loading booking..." sections={4} joined/>
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

    const priceField = (name: "pricePerGuest" | "nightlyRate" | "totalAmount", label: string, className = "") => (
        <TextField
            label={label}
            id={name}
            name={name}
            // Text, not type="number": a number field in an English browser turns "45,50" into 4550 (audit FE-03).
            // A comma is read as the decimal point, and anything that is not a plain amount is not taken.
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            value={form[name] ?? ""}
            onChange={(e) => {
                const typed = e.target.value.replace(",", ".");
                if (!/^\d*\.?\d*$/.test(typed)) return;
                setForm({...form, [name]: typed});
                recheck(e.target);
                setLastEdited(name);
            }}
            disabled={pricesLocked}
            placeholder={pricesLocked ? "Pick dates" : ""}
            className={`num min-w-0 ${className}`}
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
                subtitle={existing ? bookingLabel(existing) : undefined}
                isDirty={isDirty}
                back={back}
                onDelete={canCancel ? () => {
                    cancelMutation.reset();
                    setConfirmCancel(true);
                } : undefined}
                deleteLabel="Cancel"
                // Owner's decision (2026-11-13): a booking from a channel (not Direct) stays in its room
                onMove={canCancel && existing?.source === "DIRECT" ? () => setMoveOpen(true) : undefined}
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
                    <Callout tone="warning" role="alert" title="Check the price">
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
                                        repriceForDates(checkIn, checkOut);
                                        setDatesMissing(false);
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
                            <div className="grid grid-cols-2 gap-3">
                                {priceField("totalAmount", "Total", "price-total col-span-2")}
                                {priceField("nightlyRate", "Per night")}
                                {priceField("pricePerGuest", "Per guest")}
                            </div>
                        </section>

                        <section aria-labelledby="guest-heading" className={section}>
                            <h2 id="guest-heading" className="text-title-3 text-fg">Guest</h2>
                            <TextField label="Guest name" id="guestName" name="guestName" value={form.guestName} onChange={onChange}
                                       autoComplete="off" autoCapitalize="words" enterKeyHint="next" error={errors.guestName}/>
                            <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                                <TextField label="Phone" type="tel" inputMode="tel" id="guestPhone" name="guestPhone"
                                           value={form.guestPhone} onChange={onChange} autoComplete="off" enterKeyHint="next" error={errors.guestPhone}/>
                                <TextField label="Email" type="email" inputMode="email" id="guestEmail" name="guestEmail"
                                           value={form.guestEmail} onChange={onChange} autoComplete="off" autoCapitalize="none"
                                           spellCheck={false} enterKeyHint="next" error={errors.guestEmail}/>
                            </div>
                            <TextAreaField label="Notes" id="notes" name="notes" value={form.notes} onChange={onChange} rows={3} error={errors.notes}
                                           hint={form.notes.length >= NOTES_COUNTER_FROM ? `${form.notes.length} of ${MAX_NOTES_LENGTH} characters` : undefined}/>
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

            {existing && existing.source !== "DIRECT" ? (
                // Owner's decision (ICAL-01, 2026-11-13): a booking from a channel should be cancelled on that channel,
                // so that is what the dialog says, with Keep booking as the safe choice. Cancelling here anyway is
                // allowed, and the booking then stays cancelled in RoomTrack (the sync no longer brings it back).
                <ConfirmDialog
                    open={confirmCancel}
                    safeVariant="success"
                    title={`Cancel it on ${PLATFORM_NAME[existing.source] ?? existing.source}`}
                    message={<>
                        This booking is still on {PLATFORM_NAME[existing.source] ?? existing.source}. Cancel it on{" "}
                        {PLATFORM_NAME[existing.source] ?? existing.source}: RoomTrack takes it off the calendar by
                        itself at the next syncs.
                    </>}
                    cancelLabel="Keep booking"
                    confirmLabel="Cancel anyway"
                    pendingLabel="Cancelling…"
                    pending={cancelMutation.isPending}
                    error={cancelMutation.isError ? errorMessage(cancelMutation.error, "Couldn't cancel this booking.") : null}
                    onConfirm={() => cancelMutation.mutate()}
                    onCancel={() => setConfirmCancel(false)}
                />
            ) : (
            <ConfirmDialog
                open={confirmCancel}
                title={`Cancel ${(existing && guestNameOf(existing)) || "this booking"}?`}
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
            )}
        </div>
    )
}
