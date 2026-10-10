import {useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useCallback, useState} from "react";
import {createUnit, deleteUnit, getUnit, type UnitRequest, updateUnit} from "../lib/api/units.ts";
import {getProperty} from "../lib/api/properties.ts";
import {apiErrorMessage} from "../lib/api/client.ts";
import {useReturnTo} from "../lib/useReturnTo";
import ConfirmDialog from "../components/ConfirmDialog";
import FormTopBar from "../components/FormTopBar";
import {allReservationsQuery} from "../lib/api/reservations.ts";
import {unitDeleteMessage} from "../lib/plural";
import CalendarSyncLink from "../components/CalendarSyncLink.tsx";
import ExternalCalendars from "../components/ExternalCalendar.tsx";

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
    const {data: existing, isLoading: isLoadingExisting} = useQuery({
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
    const mutation = useMutation({
        mutationFn: (data: UnitRequest) =>
            isEditing ? updateUnit(unitId!, data) : createUnit(propertyId!, data),
        onSuccess: () => {
            // Prefix match — refreshes this property's list and the calendar's ["units", "all"].
            queryClient.invalidateQueries({queryKey: ["units"]});
            goBack();
        }
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
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate(form);
    }
    const closeConfirm = useCallback(() => setConfirmDelete(false), []);
    function handleBack(e: React.MouseEvent) {
        e.preventDefault();
        goBack();
    }
    if (isEditing && isLoadingExisting) {
        return <div className="text-slate-500">Loading unit...</div>;
    }

    const backLabel = backTo.startsWith("/dashboard/calendar") ? "Calendar" : (property?.name ?? "Property");
    const title = isEditing ? `Edit ${existing?.name ?? "room"}` : "Add a room";
    const isDirty = isEditing
        ? existing != null && (form.name !== existing.name || form.capacity !== existing.capacity)
        : Boolean(form.name || form.capacity !== 2);

    return (
        <div className="mx-auto max-w-xl">
            <FormTopBar
                formId="unit-form"
                saving={mutation.isPending}
                title={title}
                isDirty={isDirty}
                back={{to: backTo, label: backLabel, onClick: handleBack}}
                onDelete={isEditing ? () => {
                    deleteMutation.reset();
                    setConfirmDelete(true);
                } : undefined}
                deleteLabel="Delete room"
            />
            {property && <p className="page-subtitle mt-2">{property.name}</p>}
            <div className="surface mt-6 space-y-5">
            <form id="unit-form" onSubmit={handleSubmit} >
                <div>
                    <label className="field-label" htmlFor="name">Name</label>
                    <input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                        placeholder="Room 1"
                        className="field-input"
                    />
                </div>

                <div>
                    <label className="field-label" htmlFor="capacity">Capacity</label>
                    <input
                        id="capacity"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={form.capacity}
                        onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                        required
                        className="field-input max-w-[10rem]"
                    />
                </div>

                {mutation.isError && (
                    <p className="alert-error">{apiErrorMessage(mutation.error, "Something went wrong. Try again.")}</p>
                )}

            </form>
            <div>
            {isEditing && existing?.token && (
                <>
                    <CalendarSyncLink token={existing.token} />
                    <br/>
                    <ExternalCalendars unitId={existing.id} />
                </>
            )}
            </div>
            <ConfirmDialog
                open={confirmDelete}
                title={`Delete ${existing?.name ?? "this room"}?`}
                message={unitDeleteMessage(reservations, unitId)}
                confirmLabel="Delete room"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError
                    ? apiErrorMessage(deleteMutation.error, "Couldn't delete this room. Try again.")
                    : null}
                onConfirm={() => deleteMutation.mutate()}
                onCancel={closeConfirm}
            />
        </div>
        </div>
    );
}
