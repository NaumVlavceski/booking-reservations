import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {getFailingCalendars, syncCalendarNow, type ExternalCalendar} from "../lib/api/calendars";
import {allUnitsQuery} from "../lib/api/units";
import {propertiesQuery} from "../lib/api/properties";
import {apiErrorMessage} from "../lib/api/client";
import {formatWhen} from "../lib/dates";
import {describeSyncError, PLATFORM_NAME} from "../lib/syncErrors";
import {useToast} from "../lib/toast";
import SyncProblem from "../components/SyncProblem";
import {CheckIcon} from "../components/icons";
import PageHeader from "../components/ui/PageHeader";
import ChannelsNav from "../components/ChannelsNav";
import Card from "../components/ui/Card";
import Button, {ButtonLink} from "../components/ui/Button";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";

export default function SyncHealthPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const {data: failing, isLoading, isError, refetch, isRefetching} = useQuery({
        queryKey: ["calendars", "health"],
        queryFn: getFailingCalendars,
    });
    const {data: units} = useQuery(allUnitsQuery);
    const {data: properties} = useQuery(propertiesQuery);

    const retryMutation = useMutation({
        mutationFn: (c: ExternalCalendar) => syncCalendarNow(c.id),
        onSuccess: async (result) => {
            await queryClient.invalidateQueries();
            const platform = PLATFORM_NAME[result.platform] ?? result.platform;
            if (result.lastError) {
                toast.show(`Still failing: ${describeSyncError(result.lastError, result.platform).title}`, {tone: "error"});
            } else {
                toast.show(`${result.unitName} is syncing with ${platform} again.`);
            }
        },
        onError: (error) => toast.show(apiErrorMessage(error, "Couldn't try again right now."), {tone: "error"}),
    });

    const unitById = new Map(units?.map((u) => [u.id, u]));
    const propertyById = new Map(properties?.map((p) => [p.id, p]));

    return (
        <div>
            <PageHeader
                title="Sync status"
                description="Booking.com calendars that couldn't be updated. Until they work again, bookings made on Booking.com may be missing from your calendar."
            />
            <ChannelsNav/>

            {isLoading ? (
                <ListSkeleton rows={2} label="Loading…"/>
            ) : isError ? (
                <ErrorState title="Couldn't load the sync status" onRetry={() => refetch()} retrying={isRefetching}>
                    Check your connection and try again.
                </ErrorState>
            ) : !failing || failing.length === 0 ? (
                <EmptyState icon={<CheckIcon size={24}/>} title="All channels are syncing">
                    Bookings from Booking.com are arriving normally.
                </EmptyState>
            ) : (
                <ul className="space-y-4">
                    {failing.map((c) => {
                        const unit = unitById.get(c.unitId);
                        const property = unit ? propertyById.get(unit.propertyId) : undefined;
                        const retrying = retryMutation.isPending && retryMutation.variables?.id === c.id;
                        return (
                            <Card as="li" key={c.id} className="border-warning-line">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <h2 className="text-title-3 text-fg">
                                        {c.unitName}
                                        {property && <span className="font-normal text-muted"> · {property.name}</span>}
                                    </h2>
                                    <span className="rounded-full border border-default bg-surface-sunken px-2.5 py-0.5 text-caption font-semibold text-fg">
                                        {PLATFORM_NAME[c.platform] ?? c.platform}
                                    </span>
                                </div>

                                <div className="mt-3">
                                    <SyncProblem error={c.lastError} platform={c.platform}/>
                                </div>

                                <p className="mt-3 text-caption text-subtle">
                                    Last tried {formatWhen(c.lastSyncedAt)} · last worked {formatWhen(c.lastSuccessAt)}
                                    {c.consecutiveFailures > 1 && ` · failed ${c.consecutiveFailures} times in a row`}
                                </p>

                                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                    <Button
                                        onClick={() => retryMutation.mutate(c)}
                                        disabled={retryMutation.isPending && !retrying}
                                        loading={retrying}
                                        loadingLabel="Trying…"
                                        className="min-h-12 sm:min-h-11"
                                    >
                                        Try again
                                    </Button>
                                    {unit && (
                                        <ButtonLink
                                            to={`/dashboard/properties/${unit.propertyId}/units/${unit.id}`}
                                            variant="secondary"
                                            className="min-h-12 sm:min-h-11"
                                        >
                                            Change the calendar link
                                        </ButtonLink>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
