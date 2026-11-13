import {useState} from "react";
import {Navigate, useNavigate} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createProperty, propertiesQuery, type PropertyRequest} from "../lib/api/properties";
import {errorMessage, fieldErrors} from "../lib/errors";
import {useInlineValidation} from "../lib/useInlineValidation";
import {useOnlineStatus} from "../lib/useOnlineStatus";
import {PROPERTY_MESSAGES} from "../lib/propertyForm";
import PropertyFields from "../components/PropertyFields";
import {CheckIcon, WifiOffIcon} from "../components/icons";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import {SectionCard} from "../components/ui/Card";
import Callout from "../components/ui/Callout";
import {ErrorState, FormSkeleton} from "../components/ui/States";

const FORM_ID = "setup-property";

/**
 * First run, right after registering: the property's name, address and how many rooms it has. Saving creates
 * the property with its rooms ("Room 1", "Room 2", …) and opens the calendar. Owners who already have a
 * property never see this page.
 */
export default function OnboardingPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const online = useOnlineStatus();
    const {data: properties, isError, error, refetch, isRefetching} = useQuery(propertiesQuery);
    const [form, setForm] = useState<PropertyRequest>({name: "", address: ""});
    const [unitCount, setUnitCount] = useState("1");
    const {errors, validate, recheck, showServerErrors, otherErrors} = useInlineValidation(PROPERTY_MESSAGES);

    const mutation = useMutation({
        mutationFn: () => createProperty({...form, unitCount: Number(unitCount) || 0}),
        onSuccess: async () => {
            // Wait for the lists to include the new property and its rooms, so the calendar opens with them.
            await Promise.all([
                queryClient.invalidateQueries({queryKey: ["properties"]}),
                queryClient.invalidateQueries({queryKey: ["units"]}),
            ]);
            navigate("/dashboard/calendar", {replace: true});
        },
        onError: (err) => {
            const fields = fieldErrors(err);
            if (fields) showServerErrors(document.getElementById(FORM_ID) as HTMLFormElement | null, fields);
        },
    });

    if (isError && !properties) {
        return <ErrorState title="Couldn't load your properties" error={error} onRetry={() => refetch()} retrying={isRefetching}/>;
    }
    if (!properties) {
        return <div className="mx-auto max-w-2xl"><FormSkeleton label="Loading..." sections={1}/></div>;
    }
    // Already set up (and not the save that just happened): straight to the calendar.
    if (properties.length > 0 && !mutation.isSuccess) return <Navigate to="/dashboard/calendar" replace/>;

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!validate(e.currentTarget)) return;
        mutation.mutate();
    }

    return (
        <div className="mx-auto max-w-2xl">
            <PageHeader
                title="Add your property"
                description="Its name, address and how many rooms it has. We'll create the rooms and open your calendar."
                alerts={false}
            />
            <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
                <SectionCard id="setup-property-details" title="Property details">
                    <PropertyFields
                        form={form}
                        onChange={setForm}
                        unitCount={unitCount}
                        onUnitCountChange={setUnitCount}
                        errors={errors}
                        recheck={recheck}
                    />
                </SectionCard>
                {mutation.isError && (
                    <Callout tone="danger" role="alert">
                        {otherErrors.length > 0 ? otherErrors.join(" ") : errorMessage(mutation.error, "Couldn't save the property.")}
                    </Callout>
                )}
            </form>

            {/* Save, pinned to the bottom of the screen like every form's Save bar. */}
            <div className="fixed inset-x-0 bottom-0 z-(--rt-z-nav) border-t border-subtle bg-surface/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md sm:left-20 sm:px-6 sm:pb-3 lg:left-64 lg:px-8">
                <div className="mx-auto flex max-w-2xl flex-col gap-2">
                    {!online && (
                        <p role="status" className="flex items-center justify-center gap-2 text-body-sm font-medium text-muted sm:justify-end">
                            <WifiOffIcon size={16}/> You're offline. Connect to save.
                        </p>
                    )}
                    <div className="flex sm:justify-end">
                        <Button type="submit" form={FORM_ID} size="lg" loading={mutation.isPending || mutation.isSuccess}
                                loadingLabel="Saving..." disabled={!online} icon={<CheckIcon size={18}/>}
                                className="flex-1 sm:flex-none sm:min-w-40">
                            Save
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
