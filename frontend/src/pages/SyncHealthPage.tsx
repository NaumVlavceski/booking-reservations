import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Link} from "react-router-dom";
import {getFailingCalendars, syncCalendarNow, type ExternalCalendar} from "../lib/api/calendars";
import {allUnitsQuery} from "../lib/api/units";
import {propertiesQuery} from "../lib/api/properties";
import {apiErrorMessage} from "../lib/api/client";
import {formatWhen} from "../lib/dates";
import {describeSyncError, PLATFORM_NAME} from "../lib/syncErrors";
import {useToast} from "../lib/toast";
import SyncProblem from "../components/SyncProblem";
import {CheckIcon} from "../components/icons";

export default function SyncHealthPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const {data: failing, isLoading} = useQuery({
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
            <h1 className="page-title">Sync status</h1>
            <p className="page-subtitle mb-6">
                Booking.com and Airbnb calendars that couldn't be updated. Until they work again, bookings made on
                those channels may be missing from your calendar.
            </p>

            {isLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
            ) : !failing || failing.length === 0 ? (
                <div className="surface flex flex-col items-center gap-2 py-10 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                        <CheckIcon size={22}/>
                    </span>
                    <p className="font-semibold text-slate-700">All channels are syncing</p>
                    <p className="text-sm text-slate-500">Bookings from Booking.com and Airbnb are arriving normally.</p>
                </div>
            ) : (
                <ul className="space-y-4">
                    {failing.map((c) => {
                        const unit = unitById.get(c.unitId);
                        const property = unit ? propertyById.get(unit.propertyId) : undefined;
                        const retrying = retryMutation.isPending && retryMutation.variables?.id === c.id;
                        return (
                            <li key={c.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <p className="font-semibold text-slate-900">
                                        {c.unitName}
                                        {property && <span className="font-normal text-slate-500"> · {property.name}</span>}
                                    </p>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                                        {PLATFORM_NAME[c.platform] ?? c.platform}
                                    </span>
                                </div>

                                <div className="mt-3">
                                    <SyncProblem error={c.lastError} platform={c.platform}/>
                                </div>

                                <p className="mt-3 text-xs text-slate-500">
                                    Last tried {formatWhen(c.lastSyncedAt)} · last worked {formatWhen(c.lastSuccessAt)}
                                    {c.consecutiveFailures > 1 && ` · failed ${c.consecutiveFailures} times in a row`}
                                </p>

                                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => retryMutation.mutate(c)}
                                        disabled={retryMutation.isPending}
                                        className="btn btn-primary min-h-11"
                                    >
                                        {retrying ? "Trying…" : "Try again"}
                                    </button>
                                    {unit && (
                                        <Link
                                            to={`/dashboard/properties/${unit.propertyId}/units/${unit.id}`}
                                            className="btn btn-secondary min-h-11"
                                        >
                                            Change the calendar link
                                        </Link>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
