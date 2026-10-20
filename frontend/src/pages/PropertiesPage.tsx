// src/pages/PropertiesPage.tsx
import {useCallback, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Link} from "react-router-dom";
import {deleteProperty, propertiesQuery, type PropertyResponse} from "../lib/api/properties";
import {allUnitsQuery} from "../lib/api/units";
import {apiErrorMessage} from "../lib/api/client";
import {allReservationsQuery} from "../lib/api/reservations";
import {propertyDeleteMessage} from "../lib/plural";
import {ChevronRightIcon, EditIcon, HouseIcon, PlusIcon, TrashIcon} from "../components/icons";
import ConfirmDialog from "../components/ConfirmDialog";
import PageHeader from "../components/ui/PageHeader";
import {ButtonLink} from "../components/ui/Button";
import Fab from "../components/ui/Fab";
import Menu from "../components/ui/Menu";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    return (words[0]?.[0] ?? "").concat(words[1]?.[0] ?? "").toUpperCase();
}

export default function PropertiesPage() {
    const {data: properties, isLoading, isError, refetch, isRefetching} = useQuery(propertiesQuery);
    // Same query the calendar uses, so this is usually already cached.
    const {data: units} = useQuery(allUnitsQuery);
    const {data: reservations} = useQuery(allReservationsQuery);
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
    const hasProperties = Boolean(properties && properties.length > 0);

    return (
        <div>
            <PageHeader
                title="Properties"
                back={{to: "/dashboard/calendar"}}
                actions={hasProperties && (
                    <ButtonLink to="/dashboard/properties/new" icon={<PlusIcon size={18}/>} className="hidden sm:inline-flex">
                        Add property
                    </ButtonLink>
                )}
            />

            {isLoading ? (
                <ListSkeleton rows={3} label="Loading properties..."/>
            ) : isError ? (
                <ErrorState title="Couldn't load properties" onRetry={() => refetch()} retrying={isRefetching}>
                    Try refreshing the page.
                </ErrorState>
            ) : !hasProperties ? (
                <EmptyState
                    icon={<HouseIcon size={24}/>}
                    title="No properties yet"
                    action={<ButtonLink to="/dashboard/properties/new" size="lg" icon={<PlusIcon size={18}/>}>Add a property</ButtonLink>}
                >
                    Add your first property to start setting up rooms and reservations.
                </EmptyState>
            ) : (
                <ul className="stack-list">
                    {properties!.map((property) => {
                        const unitCount = units ? (unitCountByProperty.get(property.id) ?? 0) : undefined;
                        return (
                            <li key={property.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-surface-hover">
                                <Link
                                    to={`/dashboard/properties/${property.id}`}
                                    className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 sm:gap-4 sm:pl-5"
                                >
                                    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-body-sm font-bold text-on-primary-soft">
                                        {initials(property.name)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-title-3 text-fg">{property.name}</span>
                                        {property.address && <span className="block truncate text-body-sm text-muted">{property.address}</span>}
                                        <span className="num block text-caption text-subtle">
                                            {unitCount !== undefined && `${unitCount} ${unitCount === 1 ? "room" : "rooms"}`}
                                        </span>
                                    </span>
                                    <ChevronRightIcon size={20} className="shrink-0 text-subtle"/>
                                </Link>
                                <Menu
                                    label={`Actions for ${property.name}`}
                                    items={[
                                        {kind: "link", label: "Edit property", to: `/dashboard/properties/${property.id}/edit`, icon: <EditIcon size={18}/>},
                                        {
                                            kind: "button", label: `Delete ${property.name}`, danger: true, icon: <TrashIcon size={18}/>,
                                            onSelect: () => {
                                                deleteMutation.reset();
                                                setPropertyToDelete(property);
                                            },
                                        },
                                    ]}
                                />
                            </li>
                        );
                    })}
                </ul>
            )}

            {hasProperties && <Fab to="/dashboard/properties/new" icon={<PlusIcon size={20}/>}>Add property</Fab>}

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
