import {Link, useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {getProperty} from "../lib/api/properties.ts";
import {getUnitsForProperty, deleteUnit, type UnitResponse} from "../lib/api/units.ts";
import {apiErrorMessage} from "../lib/api/client.ts";
import {ChevronLeftIcon, PersonIcon, PlusIcon} from "../components/icons";
import ConfirmDialog from "../components/ConfirmDialog";
import {allReservationsQuery} from "../lib/api/reservations.ts";
import {unitDeleteMessage} from "../lib/plural";
import {useFromHere} from "../lib/useReturnTo";
import {useCallback, useState} from "react";

export default function PropertyDetailPage() {
    const {id} = useParams();
    const propertyId = id!;
    const queryClient = useQueryClient();
    const fromHere = useFromHere();
    const {data:property,isLoading:isLoadingProperty} = useQuery({
        queryKey: ["properties", propertyId],
        queryFn: ()=> getProperty(propertyId)
    });
    const {data:units,isLoading: isLoadingUnits} = useQuery({
        queryKey: ["units", propertyId],
        queryFn: ()=>getUnitsForProperty(propertyId),
    })
    const [unitToDelete, setUnitToDelete] = useState<UnitResponse | null>(null);
    const {data: reservations} = useQuery(allReservationsQuery);
    const deleteMutation = useMutation({
        mutationFn: deleteUnit,
        onSuccess: async () => {
            // Prefix match also refreshes the calendar's ["units", "all"]; the
            // unit's reservations were deleted with it (DB cascade).
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["units"] }),
                queryClient.invalidateQueries({ queryKey: ["reservations"] }),
            ]);
            setUnitToDelete(null);
        },
    });
    const closeConfirm = useCallback(() => setUnitToDelete(null), []);
    const handleDelete = (unit: UnitResponse) => {
        deleteMutation.reset();
        setUnitToDelete(unit);
    }
    if (isLoadingProperty) {
        return <div className="text-slate-500">Loading property...</div>;
    }

    if (!property) {
        return <div className="alert-error">Property not found.</div>;
    }

    return (
        <div className="pt-6">
            <Link to="/dashboard/properties" className="back-link">
                <ChevronLeftIcon/> Properties
            </Link>

            <div className="mb-8 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="page-title">{property.name}</h1>
                    <p className="page-subtitle">{property.address}</p>
                </div>
                <Link
                    to={`/dashboard/properties/${propertyId}/edit`}
                    className="shrink-0 pt-1 text-sm font-semibold text-teal-700 sm:hidden"
                >
                    Edit
                </Link>
                <Link
                    to={`/dashboard/properties/${propertyId}/edit`}
                    className="btn btn-secondary hidden shrink-0 sm:inline-flex"
                >
                    Edit property
                </Link>
            </div>

            <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-slate-900">
                    Units {units && <span className="font-medium text-slate-400">({units.length})</span>}
                </h2>
                <Link to={`/dashboard/properties/${propertyId}/units/new`} state={fromHere} className="btn btn-primary px-3 py-2 sm:px-4 sm:py-2.5">
                    <PlusIcon size={16}/> Add unit
                </Link>
            </div>

            {isLoadingUnits ? (
                <div className="text-slate-500">Loading units...</div>
            ) : !units || units.length === 0 ? (
                <div className="surface py-12 text-center">
                    <p className="mb-4 text-slate-500">No units yet for this property.</p>
                    <Link
                        to={`/dashboard/properties/${propertyId}/units/new`}
                        state={fromHere}
                        className="font-semibold text-teal-700"
                    >
                        Add your first unit
                    </Link>
                </div>
            ) : (
                <div className="stack-list">
                    {units.map((unit) => (
                        <div key={unit.id} className="stack-row flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <h3 className="truncate font-bold text-slate-900">{unit.name}</h3>
                                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                                    <PersonIcon/> Sleeps {unit.capacity}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-4">
                                <Link
                                    to={`/dashboard/properties/${propertyId}/units/${unit.id}`}
                                    state={fromHere}
                                    className="text-sm font-semibold text-teal-700"
                                >
                                    Edit
                                </Link>
                                <button
                                    onClick={() => handleDelete(unit)}
                                    disabled={deleteMutation.isPending}
                                    className="text-sm font-semibold text-red-600 disabled:opacity-50"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={unitToDelete !== null}
                title={`Delete ${unitToDelete?.name ?? "this unit"}?`}
                message={unitDeleteMessage(reservations, unitToDelete?.id)}
                confirmLabel="Delete unit"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError
                    ? apiErrorMessage(deleteMutation.error, "Couldn't delete this unit. Try again.")
                    : null}
                onConfirm={() => unitToDelete && deleteMutation.mutate(unitToDelete.id)}
                onCancel={closeConfirm}
            />
        </div>
    );
}
