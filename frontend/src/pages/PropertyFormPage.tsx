import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useCallback, useEffect, useState} from "react";
import {
    createProperty,
    deleteProperty,
    getProperty,
    propertiesQuery,
    type PropertyRequest,
    updateProperty
} from "../lib/api/properties.ts";
import {allUnitsQuery} from "../lib/api/units.ts";
import {allReservationsQuery} from "../lib/api/reservations.ts";
import {apiErrorMessage} from "../lib/api/client.ts";
import {propertyDeleteMessage} from "../lib/plural";
import FormTopBar from "../components/FormTopBar";
import ConfirmDialog from "../components/ConfirmDialog";

const MAX_ROOMS = 200;

export default function PropertyFormPage() {
    const {id} = useParams();
    const isEditing = Boolean(id);
    const [searchParams] = useSearchParams();
    const isWelcome = !isEditing && searchParams.get("welcome") === "1";
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [form, setForm] = useState<PropertyRequest>({
        name: "",
        address: "",
        timezone: "Europe/Skopje",
    })
    const [unitCount, setUnitCount] = useState("1");
    const {data: existing, isLoading: isLoadingExisting} = useQuery({
        queryKey: ["properties", id],
        queryFn: () => getProperty(id!),
        enabled: isEditing,
    });
    useEffect(() => {
        if (existing) {
            setForm({
                name: existing.name,
                address: existing.address,
                timezone: existing.timezone,
            });
        }
    }, [existing]);
    const mutation = useMutation({
        mutationFn: (data: PropertyRequest) =>
            isEditing ? updateProperty(id!, data) : createProperty(data),
        onSuccess: async ()=>{
            await queryClient.invalidateQueries({queryKey: ["properties"]});
            if (isEditing) {
                navigate(`/dashboard/properties/${id}`);
                return;
            }
            // New rooms were created alongside the property. Load them *before*
            // showing the calendar so it never renders empty — the mutation stays
            // pending meanwhile, so the button keeps showing "Saving...".
            await queryClient.invalidateQueries({queryKey: ["units"]});
            await Promise.all([
                queryClient.fetchQuery(propertiesQuery),
                queryClient.fetchQuery(allUnitsQuery),
            ]);
            navigate("/dashboard/calendar", {replace: isWelcome});
        }
    })
    const [confirmDelete, setConfirmDelete] = useState(false);
    const {data: units} = useQuery({...allUnitsQuery, enabled: isEditing});
    const {data: reservations} = useQuery({...allReservationsQuery, enabled: isEditing});
    const deleteMutation = useMutation({
        mutationFn: () => deleteProperty(id!),
        onSuccess: async () => {
            // Its units and their reservations went with it (DB cascade). Skip
            // this page's own ["properties", id] query — refetching it would 404.
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ["properties"],
                    predicate: (q) => q.queryKey[1] !== id,
                }),
                queryClient.invalidateQueries({queryKey: ["units"]}),
                queryClient.invalidateQueries({queryKey: ["reservations"]}),
            ]);
            // No removeQueries(["properties", id]) here: this page is still mounted
            // at this point and would immediately refetch it (404). Once we've
            // navigated away it's unused and the cache drops it by itself.
            navigate("/dashboard/properties", {replace: true});
        },
    });
    const closeConfirm = useCallback(() => setConfirmDelete(false), []);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate(isEditing ? form : {...form, unitCount: Number(unitCount) || 0});
    }
    if (isEditing && isLoadingExisting) {
        return <div className="text-slate-500">Loading property...</div>;
    }

    const title = isEditing ? "Edit property" : isWelcome ? "Set up your first property" : "Add a property";

    return (
        <div className="mx-auto max-w-xl">
            <FormTopBar
                formId="property-form"
                saving={mutation.isPending}
                back={isWelcome ? undefined : {
                    to: isEditing ? `/dashboard/properties/${id}` : "/dashboard/properties",
                    label: isEditing ? (existing?.name ?? "Property") : "Properties",
                }}
                onDelete={isEditing ? () => {
                    deleteMutation.reset();
                    setConfirmDelete(true);
                } : undefined}
                deleteLabel="Delete property"
            />
            <div className="mb-6 mt-2">
                <h1 className="page-title">{title}</h1>
                {isWelcome && (
                    <p className="page-subtitle">
                        Tell us about your place and how many rooms it has — we'll create them for you.
                    </p>
                )}
            </div>

            <form id="property-form" onSubmit={handleSubmit} className="surface space-y-5">
                <div>
                    <label className="field-label" htmlFor="name">Name</label>
                    <input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                        placeholder="Apartments Vlavcheski"
                        className="field-input"
                    />
                </div>

                <div>
                    <label className="field-label" htmlFor="address">Address</label>
                    <input
                        id="address"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        required
                        placeholder="Peštani, Lake Ohrid, North Macedonia"
                        className="field-input"
                    />
                </div>

                {!isEditing && (
                    <div>
                        <label className="field-label" htmlFor="unitCount">Number of rooms</label>
                        <input
                            id="unitCount"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={MAX_ROOMS}
                            value={unitCount}
                            onChange={(e) => setUnitCount(e.target.value)}
                            required
                            className="field-input max-w-[10rem]"
                        />
                        <p className="field-hint">
                            Named Room 1, Room 2, … with space for 2 guests each. You can rename them anytime.
                        </p>
                    </div>
                )}

                <div>
                    <label className="field-label" htmlFor="timezone">Timezone</label>
                    <input
                        id="timezone"
                        value={form.timezone}
                        onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                        className="field-input"
                    />
                </div>

                {mutation.isError && (
                    <p className="alert-error">
                        Something went wrong. Check your details and try again.
                    </p>
                )}
            </form>

            <ConfirmDialog
                open={confirmDelete}
                title={`Delete ${existing?.name ?? "this property"}?`}
                message={propertyDeleteMessage(id, units, reservations)}
                confirmLabel="Delete property"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError
                    ? apiErrorMessage(deleteMutation.error, "Couldn't delete this property. Try again.")
                    : null}
                onConfirm={() => deleteMutation.mutate()}
                onCancel={closeConfirm}
            />
        </div>
    );
}
