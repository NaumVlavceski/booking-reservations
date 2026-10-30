import {useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useCallback, useState} from "react";
import {createUnit, deleteUnit, getUnit, type UnitRequest, updateUnit} from "../lib/api/units.ts";
import {getProperty} from "../lib/api/properties.ts";
import {errorMessage, fieldErrors} from "../lib/errors";
import {useReturnTo} from "../lib/useReturnTo";
import ConfirmDialog from "../components/ConfirmDialog";
import FormTopBar from "../components/FormTopBar";
import {allReservationsQuery} from "../lib/api/reservations.ts";
import {unitDeleteMessage} from "../lib/plural";
import CalendarSyncLink from "../components/CalendarSyncLink.tsx";
import ExternalCalendars from "../components/ExternalCalendar.tsx";
import ChannelGuideLink from "../components/ChannelGuideLink";
import {SectionCard} from "../components/ui/Card";
import {TextField} from "../components/ui/Field";
import Callout from "../components/ui/Callout";
import {FormSkeleton, RecordLoadError} from "../components/ui/States";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";

const MESSAGES: ValidationMessages = {
    name: {valueMissing: "Enter a name for the room, e.g. Room 1."},
    capacity: {
        valueMissing: "Enter how many guests the room sleeps.",
        badInput: "Enter a whole number.",
        rangeUnderflow: "A room sleeps at least 1 guest.",
        stepMismatch: "Enter a whole number.",
    },
};

export default function UnitFormPage() {
    const {propertyId, unitId} = useParams();
    const isEditing = Boolean(unitId);
    const queryClient = useQueryClient();
    const {to: backTo, goBack} = useReturnTo(`/dashboard/properties/${propertyId}`);
    const [form, setForm] = useState<UnitRequest>({
        name: "",
        capacity: 2,
        });
    const {data: property} = useQuery({
        queryKey: ["properties", propertyId],
        queryFn: () => getProperty(propertyId!),
    });
    const {data: existing, isLoading: isLoadingExisting, error: loadError, refetch, isRefetching} = useQuery({
        queryKey: ["units", "detail", unitId],
        queryFn: () => getUnit(unitId!),
        enabled: isEditing,
    })
    // Copy the loaded unit into the form once per fetch result (render-time sync, not an effect).
    const [syncedExisting, setSyncedExisting] = useState<typeof existing>();
    if (existing && existing !== syncedExisting) {
        setSyncedExisting(existing);
        setForm({
            name: existing.name,
            capacity: existing.capacity,
        });
    }
    const {errors, validate, recheck, showServerErrors, otherErrors} = useInlineValidation(MESSAGES);
    const mutation = useMutation({
        mutationFn: (data: UnitRequest) =>
            isEditing ? updateUnit(unitId!, data) : createUnit(propertyId!, data),
        onSuccess: () => {
            // Prefix match — refreshes this property's list and the calendar's ["units", "all"].
            queryClient.invalidateQueries({queryKey: ["units"]});
            goBack();
        },
        onError: (error) => {
            const fields = fieldErrors(error);
            if (fields) showServerErrors(document.getElementById("unit-form") as HTMLFormElement | null, fields);
        },
    })
    const [confirmDelete, setConfirmDelete] = useState(false);
    const {data: reservations} = useQuery({...allReservationsQuery, enabled: isEditing});
    const deleteMutation = useMutation({
        mutationFn: () => deleteUnit(unitId!),
        onSuccess: async () => {
            // Reload the unit lists (calendar + property page) before going back, so
            // the deleted room isn't briefly shown there. Skip this page's own
            // detail query — refetching it would just 404.
            await Promise.all([
                queryClient.refetchQueries({
                    queryKey: ["units"],
                    type: "all",
                    predicate: (q) => q.queryKey[1] !== "detail",
                }),
                // Its reservations were deleted with it (DB cascade).
                queryClient.invalidateQueries({queryKey: ["reservations"]}),
            ]);
            goBack();
        },
    });
    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!validate(e.currentTarget)) return;
        mutation.mutate(form);
    }
    const closeConfirm = useCallback(() => setConfirmDelete(false), []);
    function handleBack(e: React.MouseEvent) {
        e.preventDefault();
        goBack();
    }
    if (isEditing && isLoadingExisting) {
        return (
            <div className="mx-auto max-w-2xl">
                <FormTopBar formId="unit-form" saving={false} title="Edit room" back={{to: backTo, onClick: handleBack}}/>
                <FormSkeleton label="Loading room..." sections={2}/>
            </div>
        );
    }
    // Never an empty form that could be saved over the real room.
    if (isEditing && !existing && loadError) {
        return (
            <div className="mx-auto max-w-2xl">
                <FormTopBar formId="unit-form" saving={false} title="Edit room" back={{to: backTo, onClick: handleBack}} hideSave/>
                <RecordLoadError what="room" error={loadError} onRetry={() => refetch()} retrying={isRefetching} backTo={backTo}/>
            </div>
        );
    }

    const title = isEditing ? `Edit ${existing?.name ?? "room"}` : "Add a room";
    const isDirty = isEditing
        ? existing != null && (form.name !== existing.name || form.capacity !== existing.capacity)
        : Boolean(form.name || form.capacity !== 2);

    return (
        <div className="mx-auto max-w-2xl">
            <FormTopBar
                formId="unit-form"
                saving={mutation.isPending}
                title={title}
                subtitle={property?.name}
                isDirty={isDirty}
                back={{to: backTo, onClick: handleBack}}
                onDelete={isEditing ? () => {
                    deleteMutation.reset();
                    setConfirmDelete(true);
                } : undefined}
                deleteLabel="Delete room"
            />

            <div className="space-y-4">
                <form id="unit-form" onSubmit={handleSubmit} noValidate className="space-y-4">
                    <SectionCard id="room-details" title="Room details">
                        <TextField
                            label="Name"
                            id="name"
                            name="name"
                            value={form.name}
                            onChange={(e) => {
                                setForm({...form, name: e.target.value});
                                recheck(e.target);
                            }}
                            required
                            autoComplete="off"
                            autoCapitalize="words"
                            enterKeyHint="next"
                            placeholder="Room 1"
                            error={errors.name}
                        />
                        <TextField
                            label="Capacity"
                            id="capacity"
                            name="capacity"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={form.capacity}
                            onChange={(e) => {
                                setForm({...form, capacity: Number(e.target.value)});
                                recheck(e.target);
                            }}
                            required
                            enterKeyHint="done"
                            hint="How many guests the room sleeps."
                            error={errors.capacity}
                        />
                    </SectionCard>

                    {mutation.isError && (
                        <Callout tone="danger" role="alert">{otherErrors.length > 0 ? otherErrors.join(" ") : errorMessage(mutation.error, "Couldn't save the room.")}</Callout>
                    )}
                </form>

                {isEditing && existing?.token && (
                    <section aria-labelledby="channels-heading" className="space-y-3 pt-2">
                        <h2 id="channels-heading" className="px-1 text-overline text-subtle uppercase">Channels</h2>
                        <ChannelGuideLink/>
                        <CalendarSyncLink token={existing.token}/>
                        <ExternalCalendars unitId={existing.id}/>
                    </section>
                )}
            </div>

            <ConfirmDialog
                open={confirmDelete}
                title={`Delete ${existing?.name ?? "this room"}?`}
                message={unitDeleteMessage(reservations, unitId)}
                confirmLabel="Delete room"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError
                    ? errorMessage(deleteMutation.error, "Couldn't delete this room.")
                    : null}
                onConfirm={() => deleteMutation.mutate()}
                onCancel={closeConfirm}
            />
        </div>
    );
}
