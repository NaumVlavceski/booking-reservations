import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useCallback, useState} from "react";
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
import {SectionCard} from "../components/ui/Card";
import {TextField} from "../components/ui/Field";
import Callout from "../components/ui/Callout";
import {FormSkeleton} from "../components/ui/States";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";

const MAX_ROOMS = 200;

const MESSAGES: ValidationMessages = {
    name: {valueMissing: "Enter a name for the property."},
    unitCount: {
        valueMissing: `Enter how many rooms it has (0 to ${MAX_ROOMS}).`,
        badInput: "Enter a whole number.",
        rangeUnderflow: "Enter 0 or more rooms.",
        rangeOverflow: `Enter at most ${MAX_ROOMS} rooms.`,
        stepMismatch: "Enter a whole number.",
    },
};

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
    })
    const [unitCount, setUnitCount] = useState("1");
    const {errors, validate, recheck} = useInlineValidation(MESSAGES);
    const {data: existing, isLoading: isLoadingExisting} = useQuery({
        queryKey: ["properties", id],
        queryFn: () => getProperty(id!),
        enabled: isEditing,
    });
    // Copy the loaded property into the form once per fetch result. Done during
    // render (React's "adjust state on prop change" pattern) rather than in an effect.
    const [syncedExisting, setSyncedExisting] = useState<typeof existing>();
    if (existing && existing !== syncedExisting) {
        setSyncedExisting(existing);
        setForm({
            name: existing.name,
            address: existing.address,
        });
    }
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

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!validate(e.currentTarget)) return;
        mutation.mutate(isEditing ? form : {...form, unitCount: Number(unitCount) || 0});
    }
    if (isEditing && isLoadingExisting) {
        return (
            <div className="mx-auto max-w-2xl">
                <FormTopBar formId="property-form" saving={false} title="Edit property"
                            back={{to: `/dashboard/properties/${id}`, label: "Property"}}/>
                <FormSkeleton label="Loading property..." sections={1}/>
            </div>
        );
    }

    const title = isEditing ? `Edit ${existing?.name ?? "property"}` : isWelcome ? "Set up your first property" : "Add a property";
    const isDirty = isEditing
        ? existing != null && (form.name !== existing.name || form.address !== existing.address)
        : Boolean(form.name || form.address || unitCount !== "1");

    return (
        <div className="mx-auto max-w-2xl">
            <FormTopBar
                formId="property-form"
                saving={mutation.isPending}
                title={title}
                isDirty={isDirty}
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
            {isWelcome && (
                <Callout tone="info" className="mb-4" title="Welcome to RoomTrack">
                    Tell us about your place and how many rooms it has — we'll create them for you.
                </Callout>
            )}

            <form id="property-form" onSubmit={handleSubmit} noValidate className="space-y-4">
                <SectionCard id="property-details" title="Property details">
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
                        placeholder="Property Name"
                        error={errors.name}
                    />
                    <TextField
                        label="Address"
                        optional
                        id="address"
                        name="address"
                        value={form.address}
                        onChange={(e) => setForm({...form, address: e.target.value})}
                        autoComplete="street-address"
                        enterKeyHint={isEditing ? "done" : "next"}
                        placeholder="Address ..."
                    />
                    {!isEditing && (
                        <TextField
                            label="Number of rooms"
                            id="unitCount"
                            name="unitCount"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={MAX_ROOMS}
                            step={1}
                            value={unitCount}
                            onChange={(e) => {
                                setUnitCount(e.target.value);
                                recheck(e.target);
                            }}
                            required
                            enterKeyHint="done"
                            hint="Named Room 1, Room 2, … with space for 2 guests each. You can rename them anytime."
                            error={errors.unitCount}
                        />
                    )}
                </SectionCard>

                {mutation.isError && (
                    <Callout tone="danger" role="alert">
                        {apiErrorMessage(mutation.error, "Something went wrong. Check your details and try again.")}
                    </Callout>
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
