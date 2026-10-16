import {useState} from "react";
import {useMutation, useQueries, useQuery, useQueryClient} from "@tanstack/react-query";
import {differenceInCalendarDays} from "date-fns";
import {dismissConflict, getOpenConflicts, type SyncConflict} from "../lib/api/conflicts";
import {getReservation, type ReservationResponse} from "../lib/api/reservations";
import {allUnitsQuery} from "../lib/api/units";
import {propertiesQuery} from "../lib/api/properties";
import {apiErrorMessage} from "../lib/api/client";
import {formatStayDays, formatWhen, parseLocalDate} from "../lib/dates";
import {PLATFORM_NAME} from "../lib/syncErrors";
import {useToast} from "../lib/toast";
import ConfirmDialog from "../components/ConfirmDialog";
import {AlertIcon, CheckIcon} from "../components/icons";
import PageHeader from "../components/ui/PageHeader";
import ChannelsNav from "../components/ChannelsNav";
import Card from "../components/ui/Card";
import Button, {ButtonLink} from "../components/ui/Button";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";

// What channels put in SUMMARY when they don't share guest details — not worth showing.
const GENERIC_SUMMARY = /^(closed\s*-\s*)?not available$|^reserved$|^blocked$|^airbnb \(not available\)$/i;

function nights(checkIn: string, checkOut: string) {
    const n = differenceInCalendarDays(parseLocalDate(checkOut), parseLocalDate(checkIn));
    return `${n} ${n === 1 ? "night" : "nights"}`;
}

export default function ConflictsPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [confirming, setConfirming] = useState<SyncConflict | null>(null);

    const {data: conflicts, isLoading, isError, refetch, isRefetching} = useQuery({queryKey: ["conflicts"], queryFn: getOpenConflicts});
    const {data: units} = useQuery(allUnitsQuery);
    const {data: properties} = useQuery(propertiesQuery);
    const reservationIds = [...new Set((conflicts ?? []).map((c) => c.conflictingReservationId).filter(Boolean))];
    const reservationQueries = useQueries({
        queries: reservationIds.map((id) => ({
            queryKey: ["reservations", "detail", id],
            queryFn: () => getReservation(id),
        })),
    });
    const reservationById = new Map<string, ReservationResponse>();
    reservationQueries.forEach((q) => q.data && reservationById.set(q.data.id, q.data));

    const dismissMutation = useMutation({
        mutationFn: (c: SyncConflict) => dismissConflict(c.id),
        onSuccess: async () => {
            setConfirming(null);
            await queryClient.invalidateQueries({queryKey: ["conflicts"]});
            toast.show("Warning dismissed. Your booking stays as it is.");
        },
    });

    const unitById = new Map(units?.map((u) => [u.id, u]));
    const propertyById = new Map(properties?.map((p) => [p.id, p]));

    return (
        <div>
            <PageHeader
                title="Booking conflicts"
                description="Booking.com or Airbnb reported a stay on dates you already have booked. Nothing was changed automatically — decide which booking is right for each one."
            />
            <ChannelsNav/>

            {isLoading ? (
                <ListSkeleton rows={2} label="Loading…"/>
            ) : isError ? (
                <ErrorState title="Couldn't load conflicts" onRetry={() => refetch()} retrying={isRefetching}>
                    Check your connection and try again.
                </ErrorState>
            ) : !conflicts || conflicts.length === 0 ? (
                <EmptyState icon={<CheckIcon size={24}/>} title="No conflicts">
                    Your channels agree with your calendar.
                </EmptyState>
            ) : (
                <ul className="space-y-4">
                    {conflicts.map((c) => {
                        const platform = PLATFORM_NAME[c.platform] ?? c.platform;
                        const unit = unitById.get(c.unitId);
                        const property = unit ? propertyById.get(unit.propertyId) : undefined;
                        const existing = reservationById.get(c.conflictingReservationId);
                        const existingName = existing?.guestName?.trim() || "the existing booking";
                        const incoming = formatStayDays(c.incomingStart, c.incomingEnd);
                        const note = c.incomingSummary && !GENERIC_SUMMARY.test(c.incomingSummary.trim())
                            ? c.incomingSummary : null;

                        return (
                            <Card as="li" key={c.id} className="border-danger-line">
                                <div className="flex items-start gap-3">
                                    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                                        <AlertIcon size={18}/>
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-title-3 text-fg">
                                            {c.unitName}
                                            {property && <span className="font-normal text-muted"> · {property.name}</span>}
                                        </h2>
                                        <p className="mt-0.5 text-body-sm text-muted">
                                            {c.kind === "NEW_OVERLAP"
                                                ? `${platform} has a new booking that overlaps a stay already on your calendar.`
                                                : `A ${platform} booking moved to dates that overlap a stay already on your calendar. It still shows its old dates for now.`}
                                        </p>
                                    </div>
                                </div>

                                <dl className="mt-4 grid gap-2 text-body-sm sm:grid-cols-2">
                                    <div className="rounded-xl border border-danger-line bg-danger-soft px-3.5 py-3">
                                        <dt className="text-caption font-semibold text-danger">{platform} says</dt>
                                        <dd className="num mt-0.5 font-semibold text-fg">
                                            {incoming} <span className="font-normal text-muted">· {nights(c.incomingStart, c.incomingEnd)}</span>
                                        </dd>
                                        {note && <dd className="mt-0.5 text-muted">“{note}”</dd>}
                                    </div>
                                    <div className="rounded-xl border border-subtle bg-surface-sunken px-3.5 py-3">
                                        <dt className="text-caption font-semibold text-muted">Your calendar has</dt>
                                        <dd className="mt-0.5 font-semibold text-fg">
                                            {existing ? (
                                                <>
                                                    {existingName}{" "}
                                                    <span className="num block font-normal text-muted">{formatStayDays(existing.checkIn, existing.checkOut)}</span>
                                                </>
                                            ) : "A booking on these dates"}
                                        </dd>
                                    </div>
                                </dl>

                                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                    <ButtonLink to={`/dashboard/reservations/${c.conflictingReservationId}`} className="min-h-12 sm:min-h-11">
                                        Change {existing ? `${existingName}’s` : "my"} booking
                                    </ButtonLink>
                                    <Button
                                        variant="secondary"
                                        className="min-h-12 sm:min-h-11"
                                        onClick={() => {
                                            dismissMutation.reset();
                                            setConfirming(c);
                                        }}
                                    >
                                        Keep my booking
                                    </Button>
                                </div>
                                <p className="mt-3 text-caption text-subtle">
                                    “Keep my booking” hides this warning. Your reservation is not changed.
                                </p>
                                <p className="mt-1 text-caption text-subtle">
                                    Reported {formatWhen(c.createdAt)}
                                </p>
                            </Card>
                        );
                    })}
                </ul>
            )}

            <ConfirmDialog
                open={confirming !== null}
                variant="neutral"
                title="Keep your booking?"
                message={confirming && (
                    <>
                        We’ll stop warning you about these dates. To avoid a double booking, make sure{" "}
                        <strong>{formatStayDays(confirming.incomingStart, confirming.incomingEnd)}</strong> is closed or
                        cancelled on {PLATFORM_NAME[confirming.platform] ?? confirming.platform}.
                    </>
                )}
                confirmLabel="Keep my booking"
                pendingLabel="Saving…"
                cancelLabel="Go back"
                pending={dismissMutation.isPending}
                error={dismissMutation.isError ? apiErrorMessage(dismissMutation.error, "Couldn't dismiss this warning.") : null}
                onConfirm={() => confirming && dismissMutation.mutate(confirming)}
                onCancel={() => setConfirming(null)}
            />
        </div>
    );
}
