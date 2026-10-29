import {useState, type ReactNode} from "react";
import {Link, Navigate, useNavigate, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createProperty, propertiesQuery, updateProperty, type PropertyRequest, type PropertyResponse} from "../lib/api/properties";
import {getUnitsForProperty} from "../lib/api/units";
import {apiErrorMessage} from "../lib/api/client";
import {
    ONBOARDING_PATH,
    ONBOARDING_STEPS,
    saveOnboarding,
    useOnboardingState,
    type OnboardingStep,
} from "../lib/onboarding";
import {useInlineValidation} from "../lib/useInlineValidation";
import {useFromHere} from "../lib/useReturnTo";
import {useOnlineStatus} from "../lib/useOnlineStatus";
import {useToast} from "../lib/toast";
import {PROPERTY_MESSAGES} from "../lib/propertyForm";
import PropertyFields from "../components/PropertyFields";
import ChannelGuideLink from "../components/ChannelGuideLink";
import CalendarSyncLink from "../components/CalendarSyncLink";
import ExternalCalendars from "../components/ExternalCalendar";
import {BedIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PersonIcon, PlusIcon, WifiOffIcon} from "../components/icons";
import PageHeader from "../components/ui/PageHeader";
import Button, {ButtonLink} from "../components/ui/Button";
import {SectionCard} from "../components/ui/Card";
import {SelectField} from "../components/ui/Field";
import Callout from "../components/ui/Callout";
import {EmptyState, ErrorState, FormSkeleton, ListSkeleton} from "../components/ui/States";

const TITLES: Record<OnboardingStep, string> = {
    1: "Add your property",
    2: "Check your rooms",
    3: "Connect Booking.com",
};

function toStep(value: number): OnboardingStep {
    return value >= 3 ? 3 : value === 2 ? 2 : 1;
}

/**
 * Guided first run for a new owner: 1) the property, 2) its rooms, 3) Booking.com calendar links. Every step
 * reuses the regular forms and APIs; it can be skipped at any point and picked up again from the menu.
 */
export default function OnboardingPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [searchParams] = useSearchParams();
    const {email, state} = useOnboardingState();
    const {data: properties, isError, refetch, isRefetching} = useQuery(propertiesQuery);

    const active = state?.status === "active" ? state : null;
    // The property this setup created, as long as it still exists.
    const property = properties?.find((p) => p.id === active?.propertyId);
    // Steps 2 and 3 need that property; without it everything starts at step 1.
    const step = property ? toStep(Number(searchParams.get("step")) || active?.step || 1) : 1;

    if (isError) {
        return (
            <ErrorState title="Couldn't load your properties" onRetry={() => refetch()} retrying={isRefetching}>
                Check your connection and try again.
            </ErrorState>
        );
    }
    if (!email || !properties) {
        return <div className="mx-auto max-w-2xl"><FormSkeleton label="Loading setup..." sections={1}/></div>;
    }
    // Owners who already have a property (and aren't mid-setup) don't need it.
    if (properties.length > 0 && !active) return <Navigate to="/dashboard/calendar" replace/>;

    function remember(next: OnboardingStep, propertyId = property?.id) {
        saveOnboarding(email!, {status: "active", step: next, propertyId});
    }

    function goTo(next: OnboardingStep) {
        remember(next);
        navigate(`${ONBOARDING_PATH}?step=${next}`);
    }

    function leave(status: "skipped" | "done") {
        saveOnboarding(email!, {status});
        if (status === "done") toast.show("You're all set. Here's your calendar.");
        navigate("/dashboard/calendar", {replace: true});
    }

    const description: Record<OnboardingStep, ReactNode> = {
        1: property
            ? "Check your property's name and address, then continue to its rooms."
            : "Welcome to RoomTrack! Three quick steps and your calendar is ready. First, tell us about your place and how many rooms it has — we'll create them for you.",
        2: <>These are the rooms of <span className="font-semibold text-fg">{property?.name}</span>. Rename them to match your place and set how many guests each one sleeps. Every room gets its own row on the calendar.</>,
        3: "Link each room to its Booking.com calendar, so bookings made there show up here and dates booked here get blocked there. You can also do this later from any room's page.",
    };

    return (
        <div className="mx-auto max-w-2xl">
            <PageHeader
                title={TITLES[step]}
                description={description[step]}
                alerts={false}
                actions={<Button variant="ghost" size="sm" onClick={() => leave("skipped")}>Skip setup</Button>}
            />
            <SetupProgress step={step}/>

            {step === 1 ? (
                <PropertyStep
                    property={property}
                    onSaved={(id) => remember(2, id)}
                    onDone={() => navigate(`${ONBOARDING_PATH}?step=2`)}
                />
            ) : step === 2 ? (
                <RoomsStep property={property!} onBack={() => goTo(1)} onNext={() => goTo(3)}/>
            ) : (
                <ChannelsStep property={property!} onBack={() => goTo(2)} onFinish={() => leave("done")}/>
            )}
        </div>
    );
}

function SetupProgress({step}: { step: OnboardingStep }) {
    return (
        <div className="mb-4 sm:mb-6">
            <p className="num text-body-sm font-semibold text-muted">Step {step} of {ONBOARDING_STEPS.length}</p>
            <ol className="mt-2 grid grid-cols-3 gap-2">
                {ONBOARDING_STEPS.map((label, i) => {
                    const n = i + 1;
                    return (
                        <li key={label} aria-current={n === step ? "step" : undefined}>
                            <span aria-hidden="true" className={`block h-1.5 rounded-full ${n <= step ? "bg-primary" : "bg-surface-pressed"}`}/>
                            <span className={`mt-1.5 flex items-center gap-1 text-caption ${n === step ? "font-semibold text-fg" : "text-subtle"}`}>
                                {n < step && <CheckIcon size={13} className="text-primary"/>}
                                {label}
                                {n < step && <span className="sr-only"> (done)</span>}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

/** Back / Continue, pinned to the bottom of the screen like a form's Save bar. */
function StepBar({onBack, children}: { onBack?: () => void; children: ReactNode }) {
    const online = useOnlineStatus();
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-subtle bg-surface/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md sm:left-20 sm:px-6 sm:pb-3 lg:left-64 lg:px-8">
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
                {!online && (
                    <p role="status" className="flex items-center justify-center gap-2 text-body-sm font-medium text-muted sm:justify-end">
                        <WifiOffIcon size={16}/> You're offline. Connect to continue.
                    </p>
                )}
                <div className="flex items-center gap-2 sm:justify-end sm:gap-3">
                    {onBack && (
                        <Button variant="secondary" size="lg" onClick={onBack} icon={<ChevronLeftIcon size={18}/>} className="shrink-0">
                            Back
                        </Button>
                    )}
                    {children}
                </div>
            </div>
        </div>
    );
}

function PropertyStep({property, onSaved, onDone}: {
    property?: PropertyResponse;
    /** Right after saving: remember the property, before the lists reload (which would otherwise end the setup). */
    onSaved: (propertyId: string) => void;
    /** Once the lists include it: on to the rooms. */
    onDone: () => void;
}) {
    const queryClient = useQueryClient();
    const online = useOnlineStatus();
    // Coming back to this step edits the property it created instead of adding a second one.
    const [form, setForm] = useState<PropertyRequest>({name: property?.name ?? "", address: property?.address ?? ""});
    const [unitCount, setUnitCount] = useState("1");
    const {errors, validate, recheck} = useInlineValidation(PROPERTY_MESSAGES);
    const mutation = useMutation({
        mutationFn: () => property
            ? updateProperty(property.id, form)
            : createProperty({...form, unitCount: Number(unitCount) || 0}),
        onSuccess: async (saved) => {
            onSaved(saved.id);
            // Wait for the lists to include the new property and its rooms, so the next step has them.
            await Promise.all([
                queryClient.invalidateQueries({queryKey: ["properties"]}),
                queryClient.invalidateQueries({queryKey: ["units"]}),
            ]);
            onDone();
        },
    });

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!validate(e.currentTarget)) return;
        mutation.mutate();
    }

    return (
        <form id="onboarding-property" onSubmit={handleSubmit} noValidate className="space-y-4">
            <SectionCard id="onboarding-property-details" title="Property details">
                <PropertyFields
                    form={form}
                    onChange={setForm}
                    unitCount={property ? undefined : unitCount}
                    onUnitCountChange={setUnitCount}
                    errors={errors}
                    recheck={recheck}
                />
            </SectionCard>
            {mutation.isError && (
                <Callout tone="danger" role="alert">
                    {apiErrorMessage(mutation.error, "Something went wrong. Check your details and try again.")}
                </Callout>
            )}
            <StepBar>
                <Button type="submit" form="onboarding-property" size="lg" loading={mutation.isPending} loadingLabel="Saving..."
                        disabled={!online} className="flex-1 sm:flex-none sm:min-w-40">
                    Continue
                    <ChevronRightIcon size={18}/>
                </Button>
            </StepBar>
        </form>
    );
}

function usePropertyUnits(propertyId: string) {
    // Same key as the property page, so edits made in the room form show up here straight away.
    return useQuery({queryKey: ["units", propertyId], queryFn: () => getUnitsForProperty(propertyId)});
}

function RoomsStep({property, onBack, onNext}: { property: PropertyResponse; onBack: () => void; onNext: () => void }) {
    const fromHere = useFromHere();
    const {data: units, isLoading, isError, refetch} = usePropertyUnits(property.id);
    const addRoomPath = `/dashboard/properties/${property.id}/units/new`;

    return (
        <section aria-labelledby="onboarding-rooms-heading">
            <div className="mb-3 flex items-center justify-between gap-4">
                <h2 id="onboarding-rooms-heading" className="text-title-2 text-fg">
                    Rooms {units && <span className="num font-medium text-subtle">({units.length})</span>}
                </h2>
                {units && units.length > 0 && (
                    <ButtonLink to={addRoomPath} state={fromHere} variant="secondary" size="sm" icon={<PlusIcon size={16}/>}>
                        Add room
                    </ButtonLink>
                )}
            </div>

            {isLoading ? (
                <ListSkeleton rows={2} label="Loading rooms..."/>
            ) : isError ? (
                <ErrorState title="Couldn't load the rooms" onRetry={() => refetch()}>
                    Check your connection and try again.
                </ErrorState>
            ) : !units || units.length === 0 ? (
                <EmptyState
                    icon={<BedIcon size={24}/>}
                    title="No rooms yet"
                    action={<ButtonLink to={addRoomPath} state={fromHere} size="lg" icon={<PlusIcon size={18}/>}>Add your first room</ButtonLink>}
                >
                    Rooms are what guests book. Add at least one to connect it to Booking.com.
                </EmptyState>
            ) : (
                <ul className="stack-list">
                    {units.map((unit) => (
                        <li key={unit.id}>
                            <Link
                                to={`/dashboard/properties/${property.id}/units/${unit.id}`}
                                state={fromHere}
                                className="flex min-h-16 items-center gap-3 py-3 pr-3 pl-4 transition-colors hover:bg-surface-hover sm:pl-5"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-title-3 text-fg">{unit.name}</span>
                                    <span className="num mt-0.5 flex items-center gap-1.5 text-body-sm text-muted">
                                        <PersonIcon size={14}/> Sleeps {unit.capacity}
                                    </span>
                                </span>
                                <span className="text-body-sm font-semibold text-primary">Edit</span>
                                <ChevronRightIcon size={20} className="shrink-0 text-subtle"/>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <StepBar onBack={onBack}>
                <Button size="lg" onClick={onNext} className="flex-1 sm:flex-none sm:min-w-40">
                    Continue
                    <ChevronRightIcon size={18}/>
                </Button>
            </StepBar>
        </section>
    );
}

function ChannelsStep({property, onBack, onFinish}: { property: PropertyResponse; onBack: () => void; onFinish: () => void }) {
    const {data: units, isLoading, isError, refetch} = usePropertyUnits(property.id);
    const [chosenId, setChosenId] = useState<string>();
    const unit = units?.find((u) => u.id === chosenId) ?? units?.[0];

    return (
        <div className="space-y-4">
            {isLoading ? (
                <FormSkeleton label="Loading rooms..." sections={1}/>
            ) : isError ? (
                <ErrorState title="Couldn't load the rooms" onRetry={() => refetch()}>
                    Check your connection and try again.
                </ErrorState>
            ) : !unit ? (
                <EmptyState icon={<BedIcon size={24}/>} title="Add a room first"
                            action={<Button variant="secondary" onClick={onBack}>Back to rooms</Button>}>
                    Booking.com calendars are linked per room.
                </EmptyState>
            ) : (
                <>
                    <ChannelGuideLink/>
                    {units!.length > 1 && (
                        <SelectField label="Room" id="onboarding-room" value={unit.id} onChange={(e) => setChosenId(e.target.value)}
                                     hint="Each room has its own Booking.com calendar. Pick one, connect it, then the next.">
                            {units!.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </SelectField>
                    )}
                    <ExternalCalendars key={unit.id} unitId={unit.id}/>
                    <CalendarSyncLink key={unit.token} token={unit.token}/>
                </>
            )}

            <StepBar onBack={onBack}>
                <Button size="lg" onClick={onFinish} icon={<CheckIcon size={18}/>} className="flex-1 sm:flex-none sm:min-w-40">
                    Finish setup
                </Button>
            </StepBar>
        </div>
    );
}
