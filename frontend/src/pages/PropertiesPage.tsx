// src/pages/PropertiesPage.tsx
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { deleteProperty, propertiesQuery, type PropertyResponse } from "../lib/api/properties";
import { allUnitsQuery } from "../lib/api/units";
import { apiErrorMessage } from "../lib/api/client";
import { allReservationsQuery } from "../lib/api/reservations";
import { propertyDeleteMessage } from "../lib/plural";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "../components/icons";
import ConfirmDialog from "../components/ConfirmDialog";

export default function PropertiesPage() {
    const { data: properties, isLoading, isError } = useQuery(propertiesQuery);
    // Same query the calendar uses, so this is usually already cached.
    const { data: units } = useQuery(allUnitsQuery);
    const { data: reservations } = useQuery(allReservationsQuery);
    const unitCountByProperty = useMemo(() => {
        const counts = new Map<string, number>();
        for (const u of units ?? []) counts.set(u.propertyId, (counts.get(u.propertyId) ?? 0) + 1);
        return counts;
    }, [units]);

    const queryClient = useQueryClient();
    const [propertyToDelete, setPropertyToDelete] = useState<PropertyResponse | null>(null);
    const deleteMutation = useMutation({
        mutationFn: deleteProperty,
        onSuccess: async (_data, propertyId) => {
            queryClient.removeQueries({queryKey: ["properties", propertyId]});
            // Its units and their reservations were deleted with it.
            await Promise.all([
                queryClient.invalidateQueries({queryKey: ["properties"]}),
                queryClient.invalidateQueries({queryKey: ["units"]}),
                queryClient.invalidateQueries({queryKey: ["reservations"]}),
            ]);
            setPropertyToDelete(null);
        },
    });
    const closeConfirm = useCallback(() => setPropertyToDelete(null), []);

    // Deleting cascades (property → units → reservations), so spell out what goes with it.
    const deleteMessage = propertyDeleteMessage(propertyToDelete?.id, units, reservations);

    if (isLoading) {
        return <div className="text-slate-500">Loading properties...</div>;
    }

    if (isError) {
        return <div className="alert-error">Couldn't load properties. Try refreshing the page.</div>;
    }

    if (!properties || properties.length === 0) {
        return (
            <div className="surface py-16 text-center">
                <h2 className="mb-2 text-xl font-bold text-slate-900">No properties yet</h2>
                <p className="mb-6 text-slate-500">
                    Add your first property to start setting up rooms and reservations.
                </p>
                <Link to="/dashboard/properties/new" className="btn btn-primary">
                    <PlusIcon size={16}/> Add a property
                </Link>
            </div>
        );
    }

    return (
        <div>
            <div className="my-6 flex items-center justify-between gap-4">
                <h1 className="page-title">Properties</h1>
                <Link to="/dashboard/properties/new" className="btn btn-primary px-3 sm:px-4" aria-label="Add property">
                    <PlusIcon size={18}/>
                    <span className="hidden sm:inline">Add property</span>
                </Link>
            </div>

            <div className="stack-list">
                {properties.map((property) => {
                    const unitCount = units ? (unitCountByProperty.get(property.id) ?? 0) : undefined;
                    return (
                        // The row is a link + a delete button side by side — a button
                        // can't live inside a link — so the padding moves onto the link.
                        <div
                            key={property.id}
                            className="stack-row flex items-center p-0 pr-2 transition-colors sm:p-0 sm:pr-3 sm:hover:border-teal-300"
                        >
                            <Link
                                to={`/dashboard/properties/${property.id}`}
                                className="flex min-w-0 flex-1 items-center justify-between gap-4 py-4 pl-4 pr-2 sm:py-5 sm:pl-5"
                            >
                                <div className="min-w-0">
                                    <h3 className="truncate font-bold text-slate-900">{property.name}</h3>
                                    <p className="mt-0.5 truncate text-sm text-slate-500">{property.address}</p>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {property.timezone}
                                        {unitCount !== undefined && ` · ${unitCount} ${unitCount === 1 ? "unit" : "units"}`}
                                    </p>
                                </div>
                                <ChevronRightIcon className="shrink-0 text-slate-400"/>
                            </Link>
                            <button
                                type="button"
                                onClick={() => {
                                    deleteMutation.reset();
                                    setPropertyToDelete(property);
                                }}
                                title={`Delete ${property.name}`}
                                aria-label={`Delete ${property.name}`}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                                <TrashIcon size={18}/>
                            </button>
                        </div>
                    );
                })}
            </div>

            <ConfirmDialog
                open={propertyToDelete !== null}
                title={`Delete ${propertyToDelete?.name ?? "this property"}?`}
                message={deleteMessage}
                confirmLabel="Delete property"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError
                    ? apiErrorMessage(deleteMutation.error, "Couldn't delete this property. Try again.")
                    : null}
                onConfirm={() => propertyToDelete && deleteMutation.mutate(propertyToDelete.id)}
                onCancel={closeConfirm}
            />
        </div>
    );
}
