import {useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useCallback, useEffect, useState} from "react";
import {createUnit, deleteUnit, getUnit, type UnitRequest, updateUnit} from "../lib/api/units.ts";
import {getProperty} from "../lib/api/properties.ts";
import {apiErrorMessage} from "../lib/api/client.ts";
import {useReturnTo} from "../lib/useReturnTo";
import ConfirmDialog from "../components/ConfirmDialog";
import FormTopBar from "../components/FormTopBar";
import {allReservationsQuery} from "../lib/api/reservations.ts";
import {unitDeleteMessage} from "../lib/plural";

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
    useEffect(() => {
        if (existing) {
            setForm({
                name: existing.name,
                capacity: existing.capacity,
            })
        }
    }, [existing]);
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

    return (
        <div className="mx-auto max-w-xl">
            <FormTopBar
                formId="unit-form"
                saving={mutation.isPending}
                back={{to: backTo, label: backLabel, onClick: handleBack}}
                onDelete={isEditing ? () => {
                    deleteMutation.reset();
                    setConfirmDelete(true);
                } : undefined}
                deleteLabel="Delete unit"
            />
            <h1 className="page-title mt-2">
                {isEditing ? "Edit unit" : "Add a unit"}
            </h1>
            {property && <p className="page-subtitle">{property.name}</p>}

            <form id="unit-form" onSubmit={handleSubmit} className="surface mt-6 space-y-5">
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
                    <p className="alert-error">Something went wrong. Try again.</p>
                )}
            </form>

            <ConfirmDialog
                open={confirmDelete}
                title={`Delete ${existing?.name ?? "this unit"}?`}
                message={unitDeleteMessage(reservations, unitId)}
                confirmLabel="Delete unit"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError
                    ? apiErrorMessage(deleteMutation.error, "Couldn't delete this unit. Try again.")
                    : null}
                onConfirm={() => deleteMutation.mutate()}
                onCancel={closeConfirm}
            />
        </div>
    );
}
