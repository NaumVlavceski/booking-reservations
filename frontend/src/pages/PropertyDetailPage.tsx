import {Link, useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {isAxiosError} from "axios";
import {getProperty} from "../lib/api/properties.ts";
import {getUnitsForProperty, deleteUnit, type UnitResponse} from "../lib/api/units.ts";
import {apiErrorMessage} from "../lib/api/client.ts";
import {BedIcon, ChevronRightIcon, EditIcon, HouseIcon, PersonIcon, PlusIcon, TrashIcon} from "../components/icons";
import ConfirmDialog from "../components/ConfirmDialog";
import {allReservationsQuery} from "../lib/api/reservations.ts";
import {unitDeleteMessage} from "../lib/plural";
import {useFromHere} from "../lib/useReturnTo";
import {useCallback, useState} from "react";
import PageHeader from "../components/ui/PageHeader";
import {ButtonLink} from "../components/ui/Button";
import Fab from "../components/ui/Fab";
import Menu from "../components/ui/Menu";
import {EmptyState, ErrorState, ListSkeleton, Skeleton} from "../components/ui/States";

export default function PropertyDetailPage() {
    const {id} = useParams();
    const propertyId = id!;
    const queryClient = useQueryClient();
    const fromHere = useFromHere();
    const {data: property, isLoading: isLoadingProperty, error: propertyError, refetch: refetchProperty, isRefetching} = useQuery({
        queryKey: ["properties", propertyId],
        queryFn: () => getProperty(propertyId),
    });
    const {data: units, isLoading: isLoadingUnits, isError: unitsFailed, refetch: refetchUnits} = useQuery({
        queryKey: ["units", propertyId],
        queryFn: () => getUnitsForProperty(propertyId),
    });
    const [unitToDelete, setUnitToDelete] = useState<UnitResponse | null>(null);
    const {data: reservations} = useQuery(allReservationsQuery);
    const deleteMutation = useMutation({
        mutationFn: deleteUnit,
        onSuccess: async () => {
            // Prefix match also refreshes the calendar's ["units", "all"]; the
            // unit's reservations were deleted with it (DB cascade).
            await Promise.all([
                queryClient.invalidateQueries({queryKey: ["units"]}),
                queryClient.invalidateQueries({queryKey: ["reservations"]}),
            ]);
            setUnitToDelete(null);
        },
    });
    const closeConfirm = useCallback(() => setUnitToDelete(null), []);
    const handleDelete = (unit: UnitResponse) => {
        deleteMutation.reset();
        setUnitToDelete(unit);
    };
    const back = {to: "/dashboard/properties", label: "Properties"};
    const addRoomPath = `/dashboard/properties/${propertyId}/units/new`;

    if (isLoadingProperty) {
        return (
            <div role="status" aria-live="polite">
                <span className="sr-only">Loading property...</span>
                <PageHeader title={<Skeleton className="h-7 w-48"/>} back={back} alerts={false}/>
                <ListSkeleton rows={2} label="Loading rooms..."/>
            </div>
        );
    }

    if (!property) {
        const notFound = isAxiosError(propertyError) && propertyError.response?.status === 404;
        return (
            <div>
                <PageHeader title="Property" back={back}/>
                {notFound || !propertyError ? (
                    <EmptyState
                        icon={<HouseIcon size={24}/>}
                        title="Property not found."
                        action={<ButtonLink to="/dashboard/properties" variant="secondary">Back to properties</ButtonLink>}
                    >
                        It may have been deleted, or the link is wrong.
                    </EmptyState>
                ) : (
                    <ErrorState title="Couldn't load this property" onRetry={() => refetchProperty()} retrying={isRefetching}>
                        Check your connection and try again.
                    </ErrorState>
                )}
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title={property.name}
                back={back}
                description={property.address || undefined}
                actions={
                    <>
                        <ButtonLink to={`/dashboard/properties/${propertyId}/edit`} variant="ghost" className="sm:hidden" icon={<EditIcon size={18}/>}>
                            Edit
                        </ButtonLink>
                        <ButtonLink to={`/dashboard/properties/${propertyId}/edit`} variant="secondary" className="hidden sm:inline-flex" icon={<EditIcon size={18}/>}>
                            Edit property
                        </ButtonLink>
                    </>
                }
            />

            <section aria-labelledby="rooms-heading">
                <div className="mb-3 flex items-center justify-between gap-4">
                    <h2 id="rooms-heading" className="text-title-2 text-fg">
                        Rooms {units && <span className="num font-medium text-subtle">({units.length})</span>}
                    </h2>
                    <ButtonLink to={addRoomPath} state={fromHere} variant="secondary" size="sm" icon={<PlusIcon size={16}/>} className="hidden sm:inline-flex">
                        Add room
                    </ButtonLink>
                </div>

                {isLoadingUnits ? (
                    <ListSkeleton rows={3} label="Loading rooms..."/>
                ) : unitsFailed ? (
                    <ErrorState title="Couldn't load the rooms" onRetry={() => refetchUnits()}>
                        Check your connection and try again.
                    </ErrorState>
                ) : !units || units.length === 0 ? (
                    <EmptyState
                        icon={<BedIcon size={24}/>}
                        title="No rooms yet for this property."
                        action={<ButtonLink to={addRoomPath} state={fromHere} size="lg" icon={<PlusIcon size={18}/>}>Add your first room</ButtonLink>}
                    >
                        Rooms are what guests book. Each one gets its own row on the calendar.
                    </EmptyState>
                ) : (
                    <ul className="stack-list">
                        {units.map((unit) => (
                            <li key={unit.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-surface-hover">
                                <Link
                                    to={`/dashboard/properties/${propertyId}/units/${unit.id}`}
                                    state={fromHere}
                                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 sm:pl-5"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-title-3 text-fg">{unit.name}</span>
                                        <span className="num mt-0.5 flex items-center gap-1.5 text-body-sm text-muted">
                                            <PersonIcon size={14}/> Sleeps {unit.capacity}
                                        </span>
                                    </span>
                                    <span className="hidden text-body-sm font-semibold text-primary sm:inline">Edit</span>
                                    <ChevronRightIcon size={20} className="shrink-0 text-subtle"/>
                                </Link>
                                <Menu
                                    label={`Actions for ${unit.name}`}
                                    items={[
                                        {kind: "link", label: "Edit room", to: `/dashboard/properties/${propertyId}/units/${unit.id}`, state: fromHere, icon: <EditIcon size={18}/>},
                                        {kind: "button", label: `Delete ${unit.name}`, danger: true, disabled: deleteMutation.isPending, icon: <TrashIcon size={18}/>, onSelect: () => handleDelete(unit)},
                                    ]}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {units && units.length > 0 && <Fab to={addRoomPath} state={fromHere} icon={<PlusIcon size={20}/>}>Add room</Fab>}

            <ConfirmDialog
                open={unitToDelete !== null}
                title={`Delete ${unitToDelete?.name ?? "this room"}?`}
                message={unitDeleteMessage(reservations, unitToDelete?.id)}
                confirmLabel="Delete room"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError
                    ? apiErrorMessage(deleteMutation.error, "Couldn't delete this room. Try again.")
                    : null}
                onConfirm={() => unitToDelete && deleteMutation.mutate(unitToDelete.id)}
                onCancel={closeConfirm}
            />
        </div>
    );
}
