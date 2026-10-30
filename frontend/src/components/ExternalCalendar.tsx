import {errorMessage, errorReason} from "../lib/errors";
import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    addCalendar,
    deleteCalendar,
    getUnitCalendars,
    syncCalendarNow,
    type ExternalCalendar,
} from "../lib/api/calendars";
import {Link} from "react-router-dom";
import {formatWhen} from "../lib/dates";
import {useFromHere} from "../lib/useReturnTo";
import {detectPlatform, normalizeIcsUrl} from "../lib/calendarPlatform";
import {describeSyncError, PLATFORM_NAME} from "../lib/syncErrors";
import {useToast} from "../lib/toast";
import {useChannelNotice} from "../lib/channelNotice";
import ConfirmDialog from "./ConfirmDialog";
import ChannelNoticeDialog from "./ChannelNoticeDialog";
import SyncProblem from "./SyncProblem";
import Card from "./ui/Card";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Callout from "./ui/Callout";
import {Skeleton} from "./ui/States";
import {AlertIcon, CheckIcon, SyncIcon} from "./icons";

export default function ExternalCalendars({unitId}: { unitId: string }) {
    const queryClient = useQueryClient();
    const toast = useToast();
    const fromHere = useFromHere();
    const [icsUrl, setIcsUrl] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [removing, setRemoving] = useState<ExternalCalendar | null>(null);
    const channelNotice = useChannelNotice();
    const [noticeOpen, setNoticeOpen] = useState(false);

    const {data: calendars, isLoading, isError, error, refetch, isRefetching} = useQuery({
        queryKey: ["calendars", unitId],
        queryFn: () => getUnitCalendars(unitId),
    });

    const availablePlatforms = (["BOOKING"] as const).filter(
        (p) => !calendars?.some((c) => c.platform === p)
    );
    // The channel comes from the link itself, so it can never disagree with what was pasted
    const detected = detectPlatform(icsUrl);
    const alreadyConnected = detected !== null && !availablePlatforms.includes(detected);
    const canConnect = detected !== null && !alreadyConnected;

    const addMutation = useMutation({
        mutationFn: () => addCalendar(unitId, normalizeIcsUrl(icsUrl)),
        onSuccess: (added) => {
            queryClient.invalidateQueries({queryKey: ["calendars"]});
            setIcsUrl("");
            setFormError(null);
            toast.show(`${PLATFORM_NAME[added.platform]} connected. Press Sync now to bring its bookings in.`);
        },
        onError: (err) => setFormError(errorMessage(err, "Couldn't connect that calendar.")),
    });

    const deleteMutation = useMutation({
        mutationFn: (c: ExternalCalendar) => deleteCalendar(c.id),
        onSuccess: (_data, c) => {
            setRemoving(null);
            queryClient.invalidateQueries({queryKey: ["calendars"]});
            toast.show(`${PLATFORM_NAME[c.platform]} disconnected from this room.`);
        },
    });

    const syncMutation = useMutation({
        mutationFn: (c: ExternalCalendar) => syncCalendarNow(c.id),
        onSuccess: async (result) => {
            await queryClient.invalidateQueries();
            const name = PLATFORM_NAME[result.platform];
            if (result.lastError) {
                toast.show(`Still failing: ${describeSyncError(result.lastError, result.platform).title}`, {tone: "error"});
            } else {
                toast.show(`Synced with ${name}. The calendar is up to date.`);
            }
        },
        onError: (err) => toast.show(errorMessage(err, "Couldn't sync that calendar."), {tone: "error"}),
    });

    function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        // The very first connection waits for "I understand" on the sync notes.
        if (!channelNotice.understood) {
            setNoticeOpen(true);
            return;
        }
        addMutation.mutate();
    }

    return (
        <Card as="section" aria-labelledby={`import-title-${unitId}`} className="space-y-4">
            <div className="flex items-start gap-3">
                <span aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-on-primary-soft">
                    <SyncIcon size={20}/>
                </span>
                <div className="min-w-0">
                    <h2 id={`import-title-${unitId}`} className="text-title-3 text-fg">Bring in bookings from other
                        channels</h2>
                    <p className="mt-0.5 text-body-sm text-muted">
                        Paste the calendar export link from Booking.com. Its bookings then appear on your
                        calendar
                        automatically. Not sure where to find the link? See how it works on{" "}
                        <Link to="/dashboard/help/connect-calendars#booking" state={fromHere}
                              className="link underline">Booking.com</Link>.
                    </p>
                </div>
            </div>

            {isLoading && (
                <div role="status" aria-live="polite">
                    <span className="sr-only">Loading connected channels…</span>
                    <Skeleton className="h-16 w-full rounded-xl"/>
                </div>
            )}
            {isError && !calendars && (
                <Callout tone="danger" role="alert" title="Couldn't load the connected channels"
                         action={<Button variant="secondary" size="sm" onClick={() => refetch()} loading={isRefetching}
                                         loadingLabel="Trying again…">Try again</Button>}>
                    {errorReason(error)}
                </Callout>
            )}
            {calendars && calendars.length === 0 && (
                <p className="text-body-sm text-muted">No channel connected yet. Paste a calendar link below to start.</p>
            )}

            {calendars && calendars.length > 0 && (
                <ul className="space-y-2">
                    {calendars.map((c) => {
                        const syncing = syncMutation.isPending && syncMutation.variables?.id === c.id;
                        return (
                            <li key={c.id} className="rounded-xl border border-subtle bg-surface-sunken p-3 sm:p-4">
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="text-title-3 text-fg">{PLATFORM_NAME[c.platform]}</span>
                                        <StatusPill calendar={c}/>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="secondary" size="sm" className="min-h-11"
                                                onClick={() => syncMutation.mutate(c)}
                                                disabled={syncMutation.isPending && !syncing}
                                                loading={syncing} loadingLabel="Syncing…">
                                            Sync now
                                        </Button>
                                        <Button variant="danger-ghost" size="sm" className="min-h-11"
                                                onClick={() => {
                                                    deleteMutation.reset();
                                                    setRemoving(c);
                                                }}>
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                                {c.lastError && (
                                    <div className="mt-3">
                                        <SyncProblem error={c.lastError} platform={c.platform}/>
                                    </div>
                                )}
                                <p className="mt-2 text-caption text-subtle">
                                    Last synced successfully: {formatWhen(c.lastSuccessAt)}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            {availablePlatforms.length > 0 ? (
                <form onSubmit={handleAdd} className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="float-field min-w-0 flex-1">
                        <input
                            id={`ics-${unitId}`}
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            enterKeyHint="go"
                            value={icsUrl}
                            onChange={(e) => {
                                setIcsUrl(e.target.value);
                                setFormError(null);
                            }}
                            placeholder="Paste the Booking.com link"
                            aria-describedby={`ics-hint-${unitId}`}
                            aria-invalid={formError ? true : undefined}
                            required
                            className="field-input"
                        />
                        <label className="float-label" htmlFor={`ics-${unitId}`}>Calendar export link</label>
                        </div>
                        <Button type="submit" disabled={!canConnect} loading={addMutation.isPending}
                                loadingLabel="Connecting…"
                                className="min-h-12 shrink-0">
                            Connect
                        </Button>
                    </div>
                    <p id={`ics-hint-${unitId}`} aria-live="polite" className="min-h-5 text-body-sm">
                        {icsUrl.trim() === "" ? null : alreadyConnected ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                                <AlertIcon size={15}/>
                                This room already has a {PLATFORM_NAME[detected]} calendar.
                            </span>
                        ) : detected ? (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-success">
                                <CheckIcon size={15}/>
                                {PLATFORM_NAME[detected]} link detected
                            </span>
                        ) : (
                            <span className="text-muted">
                                Only Booking.com calendar links are supported.
                            </span>
                        )}
                    </p>
                    {formError && <Callout tone="danger" role="alert">{formError}</Callout>}
                </form>
            ) : (
                <p className="flex items-center gap-2 text-body-sm text-muted">
                    <CheckIcon size={16} className="text-success"/>
                    Booking.com is connected for this room.
                </p>
            )}

            <ChannelNoticeDialog
                open={noticeOpen}
                onUnderstood={() => {
                    channelNotice.markUnderstood();
                    setNoticeOpen(false);
                    addMutation.mutate();
                }}
                onClose={() => setNoticeOpen(false)}
            />

            <ConfirmDialog
                open={removing !== null}
                title={removing ? `Disconnect ${PLATFORM_NAME[removing.platform]}?` : ""}
                message={removing && (
                    <>
                        New {PLATFORM_NAME[removing.platform]} bookings will stop appearing for this room. Bookings
                        already imported stay on your calendar, but won’t update anymore.
                    </>
                )}
                confirmLabel="Disconnect"
                pendingLabel="Disconnecting…"
                cancelLabel="Keep connected"
                pending={deleteMutation.isPending}
                error={deleteMutation.isError ? errorMessage(deleteMutation.error, "Couldn't disconnect this calendar.") : null}
                onConfirm={() => removing && deleteMutation.mutate(removing)}
                onCancel={() => setRemoving(null)}
            />
        </Card>
    );
}

function StatusPill({calendar}: { calendar: ExternalCalendar }) {
    if (calendar.lastError) {
        return <Badge tone="danger" icon={<AlertIcon size={13}/>}>Not syncing</Badge>;
    }
    if (calendar.lastSuccessAt) {
        return <Badge tone="success" icon={<CheckIcon size={13} strokeWidth={2.5}/>}>Syncing</Badge>;
    }
    return <Badge tone="neutral">Not synced yet</Badge>;
}
