// One owner. Phones: header card, the red "Needs help" box when relevant, then tabs Reservations / Calendars /
// Emails / Notes. Desktop: everything in one view. Read-only except the admin's own notes.
import {useState, type ReactNode} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import axios from "axios";
import {format} from "date-fns";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import ConfirmDialog from "../components/ConfirmDialog";
import {ErrorState, ListSkeleton} from "../components/ui/States";
import {CalendarIcon, CheckIcon, EditIcon, LockIcon, MoreVerticalIcon, TrashIcon, WarningIcon} from "../components/icons";
import Sheet from "../components/ui/Sheet";
import {useToast} from "../lib/toast";
import {errorMessage} from "../lib/errors";
import {useMediaQuery} from "../lib/useMediaQuery";
import {
    createNote, deleteNote, getEmailBody, getEmailConfig, getOwner, getOwnerCalendars, getOwnerEmails, getOwnerNotes,
    getOwnerReservations, updateNote,
    type EmailRow, type Note, type OwnerDetail, type ReservationRow, type UnitCalendars,
} from "./adminApi";
import AdminPageHeader from "./AdminPageHeader";
import SendEmailDialog from "./SendEmailDialog";
import DeleteOwnerDialog from "./DeleteOwnerDialog";
import {
    absolute, ClockIcon, emailTypeLabel, EmailStatusChip, MailIcon, OkChip, OwnerAvatar, platformLabel, ReasonChip,
    RelativeTime, shortDate, timeAgo,
} from "./adminUi";

type Tab = "reservations" | "calendars" | "emails" | "notes";
const TABS: { key: Tab; label: string }[] = [
    {key: "reservations", label: "Reservations"},
    {key: "calendars", label: "Calendars"},
    {key: "emails", label: "Emails"},
    {key: "notes", label: "Notes"},
];

export default function AdminOwnerPage() {
    const {id = ""} = useParams();
    const desktop = useMediaQuery("(min-width: 1024px)");
    const [tab, setTab] = useState<Tab>("reservations");
    const [mailOpen, setMailOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();
    const queryClient = useQueryClient();
    const owner = useQuery({queryKey: ["admin", "owner", id], queryFn: () => getOwner(id), retry: false});
    const mailConfig = useQuery({queryKey: ["admin", "email-config"], queryFn: getEmailConfig, staleTime: Infinity});
    const o = owner.data;
    const back = {to: "/admin/owners", label: "Owners"};
    // Send email shows only when the server has a sender (APP_ADMIN_MAIL_FROM)
    const mailFrom = mailConfig.data?.enabled ? mailConfig.data.from ?? "" : null;
    const onMail = mailFrom !== null ? () => setMailOpen(true) : undefined;

    if (owner.isPending) return <><AdminPageHeader title="Owner" back={back}/><ListSkeleton rows={3} label="Loading owner"/></>;
    if (owner.error || !o) {
        const missing = axios.isAxiosError(owner.error) && owner.error.response?.status === 404;
        return (
            <>
                <AdminPageHeader title="Owner" back={back}/>
                <ErrorState title={missing ? "Owner not found" : "Couldn't load this owner"} error={owner.error}
                            onRetry={missing ? undefined : () => void owner.refetch()}>
                    {missing ? "This account doesn't exist any more, or it is not listed in Admin." : undefined}
                </ErrorState>
            </>
        );
    }

    const needsHelp = o.attention.filter((r) => r.code !== "INACTIVE_14D").length > 0;
    return (
        <>
            <AdminPageHeader title={o.name || o.email} mobileTitle="Owner" back={back}
                             badge={needsHelp && <Badge tone="danger" icon={<WarningIcon size={12}/>}>Needs help</Badge>}
                             actions={
                                 <>
                                     {onMail && <Button variant="secondary" icon={<MailIcon size={18}/>} onClick={onMail}>Send email</Button>}
                                     <Button variant="danger-ghost" icon={<TrashIcon size={18}/>} onClick={() => setDeleteOpen(true)}>
                                         Delete owner…
                                     </Button>
                                 </>
                             }
                             mobileActions={
                                 <button type="button" className="icon-btn -mr-2 size-11 text-fg" aria-label={`Actions for ${o.name || o.email}`}
                                         aria-haspopup="dialog" onClick={() => setActionsOpen(true)}>
                                     <MoreVerticalIcon size={22}/>
                                 </button>
                             }/>
            <Sheet open={actionsOpen} onClose={() => setActionsOpen(false)} title={`Actions for ${o.name || o.email}`}
                   footer={<Button variant="secondary" block size="lg" onClick={() => setActionsOpen(false)}>Cancel</Button>}>
                <p className="mb-2 text-micro font-semibold tracking-wider text-muted uppercase">Danger zone</p>
                <button type="button" onClick={() => {
                    setActionsOpen(false);
                    setDeleteOpen(true);
                }} className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-hover">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-danger-soft text-danger"><TrashIcon size={18}/></span>
                    <span>
                        <span className="block text-body font-semibold text-danger">Delete owner…</span>
                        <span className="block text-caption text-muted">Removes the owner and all their data</span>
                    </span>
                </button>
            </Sheet>
            {mailFrom !== null && (
                <SendEmailDialog open={mailOpen} onClose={() => setMailOpen(false)} from={mailFrom} to={o.email} ownerId={o.id}/>
            )}
            <DeleteOwnerDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} ownerId={o.id} name={o.name || o.email}
                               email={o.email}
                               onDeleted={() => {
                                   setDeleteOpen(false);
                                   queryClient.removeQueries({queryKey: ["admin", "owner", o.id]});
                                   void queryClient.invalidateQueries({queryKey: ["admin"]});
                                   toast.show(`${o.name || o.email} was deleted.`, {tone: "success"});
                                   navigate("/admin/owners", {replace: true});
                               }}/>
            {desktop ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
                        <OwnerCard o={o} heading onMail={onMail}/>
                        {o.attention.length > 0 ? <NeedsHelpBox o={o}/> : <Card className="flex items-center gap-2 text-body-sm text-muted"><CheckIcon size={16} className="text-success"/>Nothing needs attention.</Card>}
                        <Card className="col-span-2 xl:col-span-1"><h2 className="mb-3 text-title-3 text-fg">Calendars and sync</h2><CalendarsPanel id={id} compact/></Card>
                    </div>
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
                        <Card padding="none" className="xl:col-span-3"><ReservationsPanel id={id} total={o.counts.reservations} heading/></Card>
                        <div className="grid grid-cols-2 gap-5 xl:col-span-2 xl:block xl:space-y-5">
                            <Card>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <h2 className="text-title-3 text-fg">Emails</h2>
                                    {onMail && <Button icon={<MailIcon size={16}/>} onClick={onMail}>Send email</Button>}
                                </div>
                                <EmailsPanel id={id}/>
                            </Card>
                            <Card><h2 className="mb-3 text-title-3 text-fg">Notes</h2><NotesPanel id={id}/></Card>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <OwnerCard o={o} onMail={onMail}/>
                    {o.attention.length > 0 && <NeedsHelpBox o={o}/>}
                    <div role="tablist" aria-label="Owner details" className="-mx-4 flex overflow-x-auto border-b border-subtle px-4">
                        {TABS.map((t) => (
                            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                                    className={`min-h-12 shrink-0 border-b-2 px-3 text-body-sm font-semibold transition-colors ${
                                        tab === t.key ? "border-primary text-primary" : "border-transparent text-muted"
                                    }`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div role="tabpanel">
                        {tab === "reservations" && <ReservationsPanel id={id} total={o.counts.reservations}/>}
                        {tab === "calendars" && <CalendarsPanel id={id}/>}
                        {tab === "emails" && <EmailsPanel id={id} onSend={onMail}/>}
                        {tab === "notes" && <NotesPanel id={id}/>}
                    </div>
                </div>
            )}
        </>
    );
}

// ---------- header card and needs-help box ----------

function OwnerCard({o, heading = false, onMail}: { o: OwnerDetail; heading?: boolean; onMail?: () => void }) {
    return (
        <Card>
            {heading && <h2 className="mb-3 text-title-3 text-fg">Owner</h2>}
            <div className="flex items-start gap-3">
                <OwnerAvatar name={o.name} email={o.email} size="lg"/>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-title-2 text-fg">{o.name || "(no name)"}</p>
                    <div className="flex items-center gap-1">
                        <p className="min-w-0 truncate text-body-sm text-muted">{o.email}</p>
                        {onMail && (
                            <button type="button" onClick={onMail} aria-label={`Send email to ${o.email}`} title="Send email"
                                    className="icon-btn size-11 shrink-0 text-primary lg:hidden">
                                <MailIcon size={18}/>
                            </button>
                        )}
                    </div>
                    {o.phone && <p className="truncate text-body-sm text-muted">{o.phone}</p>}
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {o.emailVerified
                    ? <OkChip>Email verified</OkChip>
                    : <Badge tone="warning" icon={<WarningIcon size={12}/>}>Email not verified</Badge>}
                <Badge tone="primary" icon={<CalendarIcon size={12}/>}>{o.calendars} calendar{o.calendars === 1 ? "" : "s"}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-3 divide-x divide-(--rt-border-subtle) rounded-control border border-subtle">
                {[["Properties", o.counts.properties], ["Units", o.counts.units], ["Reservations", o.counts.reservations]].map(([label, n]) => (
                    <div key={label} className="px-3 py-2">
                        <dd className="num text-title-2 font-bold text-fg">{n}</dd>
                        <dt className="text-caption text-muted">{label}</dt>
                    </div>
                ))}
            </dl>
            <div className="mt-3 space-y-1 text-body-sm text-muted">
                <p className="flex items-center gap-2"><ClockIcon size={14}/>
                    {o.lastSeenAt ? <RelativeTime iso={o.lastSeenAt} prefix="Last seen "/> : "Never used the app"}</p>
                <p className="flex items-center gap-2"><CalendarIcon size={14}/>Registered {shortDate(o.registeredAt)}</p>
            </div>
        </Card>
    );
}

const REASON_CHIP_LABEL: Record<string, string> = {
    SYNC_FAILING: "Sync failing", OPEN_CONFLICTS: "Conflict", EMAIL_BOUNCED: "Email",
    UNVERIFIED_24H: "Unverified", STUCK_ONBOARDING: "Setup", INACTIVE_14D: "Inactive",
};

function NeedsHelpBox({o}: { o: OwnerDetail }) {
    const help = o.attention.some((r) => r.code !== "INACTIVE_14D");
    return (
        <section aria-label={help ? "Needs help" : "Activity"}
                 className={`rounded-card border p-4 sm:p-5 ${help ? "border-danger-line bg-danger-soft" : "border-subtle bg-surface"}`}>
            <h2 className={`mb-3 flex items-center gap-2 text-title-3 ${help ? "text-danger" : "text-fg"}`}>
                <WarningIcon size={18}/>{help ? "Needs help" : "Inactive"}
            </h2>
            <ul className="space-y-2.5">
                {o.attention.map((r) => (
                    <li key={r.code} className="flex items-start gap-3">
                        <ReasonChip code={r.code} label={REASON_CHIP_LABEL[r.code]}/>
                        <span className="text-body-sm text-fg">{r.text}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// ---------- reservations ----------

function nights(a: string, b: string) {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function stayLine(r: ReservationRow) {
    const n = nights(r.checkIn, r.checkOut);
    return `${r.unit} · ${format(new Date(r.checkIn), "dd")}–${format(new Date(r.checkOut), "dd MMM")} · ${n} night${n === 1 ? "" : "s"}`;
}

function StatusChip({status}: { status: string }) {
    if (status === "CANCELLED") return <Badge tone="neutral">Cancelled</Badge>;
    if (status === "PAID") return <Badge tone="success" icon={<CheckIcon size={12}/>}>Paid</Badge>;
    if (status === "BLOCK") return <Badge tone="neutral">Blocked</Badge>;
    return <Badge tone="success">Confirmed</Badge>;
}

function ReservationsPanel({id, total, heading = false}: { id: string; total: number; heading?: boolean }) {
    const [sort, setSort] = useState<"changed" | "checkin">("changed");
    const q = useInfiniteQuery({
        queryKey: ["admin", "owner", id, "reservations", sort],
        queryFn: ({pageParam}) => getOwnerReservations(id, pageParam, sort),
        initialPageParam: 0,
        getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    });
    const items = q.data?.pages.flatMap((p) => p.items) ?? [];
    const count = q.data?.pages[0]?.total ?? total;

    const sorter = (
        <label className="flex items-center gap-2 text-body-sm text-muted">
            <span className="sr-only">Sort reservations</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as "changed" | "checkin")}
                    className="min-h-11 rounded-control bg-transparent pr-1 text-body-sm font-semibold text-fg">
                <option value="changed">Recently changed</option>
                <option value="checkin">Check-in date</option>
            </select>
        </label>
    );

    return (
        <div>
            <div className={`flex items-center justify-between gap-3 ${heading ? "px-5 pt-4 pb-2" : "mb-2"}`}>
                {heading ? <h2 className="text-title-3 text-fg">Reservations</h2>
                    : <p className="text-body-sm text-muted">Showing {items.length} of {count}</p>}
                {sorter}
            </div>
            {q.isPending ? <div className={heading ? "px-5 pb-5" : ""}><ListSkeleton rows={3} label="Loading reservations"/></div>
                : q.error ? <div className={heading ? "px-5 pb-5" : ""}><ErrorState title="Couldn't load reservations" error={q.error} onRetry={() => void q.refetch()}/></div>
                    : items.length === 0 ? <p className={`text-body-sm text-muted ${heading ? "px-5 pb-5" : ""}`}>No reservations yet.</p>
                        : (
                            <ul className={heading ? "divide-y divide-(--rt-border-subtle) border-t border-subtle" : "divide-y divide-(--rt-border-subtle) overflow-hidden rounded-card border border-subtle bg-surface"}>
                                {items.map((r) => (
                                    <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-body font-semibold text-fg">{r.guestName || "No guest name"}</p>
                                            <p className="truncate text-caption text-muted">{stayLine(r)}</p>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                <StatusChip status={r.status}/>
                                                <Badge tone={r.imported ? "primary" : "neutral"}>{r.imported ? platformLabel(r.calendar) : "Manual"}</Badge>
                                                <RelativeTime iso={r.updatedAt ?? r.createdAt} prefix="Changed " className="text-caption text-subtle"/>
                                            </div>
                                        </div>
                                        {r.importedWithoutPrice
                                            ? <Badge tone="danger" icon={<WarningIcon size={12}/>}>0 · no price</Badge>
                                            : <span className="num text-body font-semibold text-fg">{r.price ?? "—"}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
            {(q.hasNextPage || heading) && items.length > 0 && (
                <div className={`flex items-center justify-between gap-3 ${heading ? "border-t border-subtle px-5 py-3" : "mt-3"}`}>
                    {heading && <p className="num text-body-sm text-muted">Showing {items.length} of {count}</p>}
                    {q.hasNextPage && (
                        <Button variant="secondary" size={heading ? "md" : "lg"} block={!heading} onClick={() => void q.fetchNextPage()}
                                loading={q.isFetchingNextPage} loadingLabel="Loading…">
                            Load {Math.min(20, count - items.length)} more
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------- calendars ----------

function CalendarsPanel({id, compact = false}: { id: string; compact?: boolean }) {
    const q = useQuery({queryKey: ["admin", "owner", id, "calendars"], queryFn: () => getOwnerCalendars(id)});
    if (q.isPending) return <ListSkeleton rows={2} label="Loading calendars"/>;
    if (q.error) return <ErrorState title="Couldn't load calendars" error={q.error} onRetry={() => void q.refetch()}/>;
    const units = q.data ?? [];
    if (units.length === 0) return <p className="text-body-sm text-muted">No units yet.</p>;
    return compact ? <CompactCalendars units={units}/> : (
        <div className="space-y-3">
            {units.map((u) => u.calendars.length === 0 ? (
                <Card key={u.unitId}>
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-title-3 text-fg">{u.unit}</h3>
                        <Badge tone="neutral">No calendar connected</Badge>
                    </div>
                    <p className="mt-2 text-caption text-muted">
                        {u.outgoingFeed ? "Outgoing feed enabled. " : ""}The outgoing feed link is never shown in the admin panel.
                    </p>
                </Card>
            ) : u.calendars.map((c) => (
                <Card key={c.id}>
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="min-w-0 truncate text-title-3 text-fg">{u.unit}</h3>
                        <div className="flex gap-1.5">
                            <Badge tone="primary">{platformLabel(c.platform)}</Badge>
                            {c.failing ? <Badge tone="danger" icon={<WarningIcon size={12}/>}>Failing</Badge> : <OkChip/>}
                        </div>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-caption text-muted"><LockIcon size={12}/>{c.host} · link hidden</p>
                    <dl className="mt-3 divide-y divide-(--rt-border-subtle) text-body-sm">
                        <Row label="Last attempt" value={c.lastAttemptAt ? <RelativeTime iso={c.lastAttemptAt}/> : "never"}/>
                        <Row label="Last success" value={c.lastSuccessAt ? <RelativeTime iso={c.lastSuccessAt}/> : "never"}/>
                        <Row label="Failures in a row" value={c.consecutiveFailures}/>
                        <Row label="Imported reservations" value={c.importedReservations}/>
                    </dl>
                    {c.lastErrorMessage && (
                        <div className="mt-3">
                            <p className="text-micro font-semibold tracking-wider text-muted uppercase">
                                Last error{c.lastErrorAt ? ` · ${absolute(c.lastErrorAt)}` : ""}
                            </p>
                            <p className="mt-1 rounded-control bg-surface-sunken px-3 py-2 font-mono text-caption break-words text-fg">{c.lastErrorMessage}</p>
                        </div>
                    )}
                </Card>
            )))}
        </div>
    );
}

function CompactCalendars({units}: { units: UnitCalendars[] }) {
    return (
        <ul className="divide-y divide-(--rt-border-subtle)">
            {units.flatMap((u) => u.calendars.length === 0
                ? [(
                    <li key={u.unitId} className="flex items-center justify-between gap-2 py-2.5">
                        <div><p className="font-semibold text-fg">{u.unit}</p>
                            <p className="text-caption text-muted">{u.outgoingFeed ? "Outgoing feed enabled" : "No feed"}</p></div>
                        <Badge tone="neutral">Not connected</Badge>
                    </li>
                )]
                : u.calendars.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-fg">{u.unit}</p>
                            <p className="truncate text-caption text-muted">
                                {c.lastSuccessAt ? `Last success ${timeAgo(c.lastSuccessAt)}` : "Never synced"}
                                {c.failing && c.lastErrorMessage ? ` · ${c.lastErrorMessage}` : ""}
                            </p>
                        </div>
                        {c.failing ? <Badge tone="danger" icon={<WarningIcon size={12}/>}>Failing</Badge> : <OkChip/>}
                    </li>
                )))}
        </ul>
    );
}

function Row({label, value}: { label: string; value: ReactNode }) {
    return (
        <div className="flex min-h-10 items-center justify-between gap-3 py-1.5">
            <dt className="text-muted">{label}</dt>
            <dd className="num font-semibold text-fg">{value}</dd>
        </div>
    );
}

// ---------- emails ----------

function EmailsPanel({id, onSend}: { id: string; onSend?: () => void }) {
    const q = useInfiniteQuery({
        queryKey: ["admin", "owner", id, "emails"],
        queryFn: ({pageParam}) => getOwnerEmails(id, pageParam),
        initialPageParam: 0,
        getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    });
    if (q.isPending) return <ListSkeleton rows={3} label="Loading emails"/>;
    if (q.error) return <ErrorState title="Couldn't load emails" error={q.error} onRetry={() => void q.refetch()}/>;
    const items = q.data.pages.flatMap((p) => p.items);
    const total = q.data.pages[0]?.total ?? 0;
    const sendButton = onSend && (
        <Button icon={<MailIcon size={16}/>} onClick={onSend}>Send email</Button>
    );
    if (items.length === 0) {
        return <div className="flex items-center justify-between gap-2"><p className="text-body-sm text-muted">No emails in the last 90 days.</p>{sendButton}</div>;
    }
    return (
        <>
            <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
                <p className="text-body-sm text-muted">{total} email{total === 1 ? "" : "s"}</p>
                {sendButton}
            </div>
            <ul className="divide-y divide-(--rt-border-subtle)">
                {items.map((e) => <EmailItem key={e.id} e={e} ownerId={id}/>)}
            </ul>
            {q.hasNextPage && (
                <Button variant="secondary" block className="mt-3" onClick={() => void q.fetchNextPage()}
                        loading={q.isFetchingNextPage} loadingLabel="Loading…">Load more</Button>
            )}
        </>
    );
}

function EmailItem({e, ownerId}: { e: EmailRow; ownerId: string }) {
    // Only emails the admin wrote keep their text; it is loaded (and audited) when opened
    const [open, setOpen] = useState(false);
    const text = useQuery({
        queryKey: ["admin", "owner", ownerId, "email-body", e.id],
        queryFn: () => getEmailBody(ownerId, e.id),
        enabled: open && e.hasBody,
    });
    return (
        <li className="py-2.5">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    {e.hasBody ? (
                        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                                className="block max-w-full truncate text-left text-body-sm font-semibold text-fg underline-offset-2 hover:underline">
                            {e.subject}
                        </button>
                    ) : <p className="truncate text-body-sm font-semibold text-fg">{e.subject}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={e.sentByAdmin ? "primary" : "neutral"} icon={e.sentByAdmin ? <MailIcon size={12}/> : undefined}>
                            {emailTypeLabel(e.type)}
                        </Badge>
                        <RelativeTime iso={e.createdAt} className="text-caption text-subtle"/>
                    </div>
                </div>
                <EmailStatusChip status={e.status}/>
            </div>
            {open && (
                <div className="mt-2 rounded-control bg-surface-sunken px-3 py-2 text-body-sm whitespace-pre-wrap text-fg">
                    {text.isPending ? "Loading…" : text.error ? errorMessage(text.error, "Couldn't load the text.") : text.data?.body}
                </div>
            )}
        </li>
    );
}

// ---------- notes ----------

function remindChip(n: Note) {
    if (n.doneAt) return <Badge tone="neutral" icon={<CheckIcon size={12}/>}>Done</Badge>;
    if (!n.remindOn) return null;
    const today = format(new Date(), "yyyy-MM-dd");
    const label = format(new Date(n.remindOn), "d MMM");
    if (n.remindOn < today) return <Badge tone="danger" icon={<ClockIcon size={12}/>}>Overdue · {label}</Badge>;
    return <Badge tone="warning" icon={<ClockIcon size={12}/>}>{n.remindOn === today ? "Remind today" : `Remind ${label}`}</Badge>;
}

function NotesPanel({id}: { id: string }) {
    const queryClient = useQueryClient();
    const key = ["admin", "owner", id, "notes"];
    const q = useQuery({queryKey: key, queryFn: () => getOwnerNotes(id)});
    const [text, setText] = useState("");
    const [remindOn, setRemindOn] = useState("");
    const [editing, setEditing] = useState<Note | null>(null);
    const [deleting, setDeleting] = useState<Note | null>(null);
    const refresh = () => {
        void queryClient.invalidateQueries({queryKey: key});
        void queryClient.invalidateQueries({queryKey: ["admin", "overview"]});
    };

    const save = useMutation({
        mutationFn: () => editing
            ? updateNote(editing.id, {text, remindOn: remindOn || null, done: Boolean(editing.doneAt)})
            : createNote(id, {text, remindOn: remindOn || null}),
        onSuccess: () => {
            setText("");
            setRemindOn("");
            setEditing(null);
            refresh();
        },
    });
    const toggleDone = useMutation({
        mutationFn: (n: Note) => updateNote(n.id, {text: n.text, remindOn: n.remindOn, done: !n.doneAt}),
        onSuccess: refresh,
    });
    const remove = useMutation({
        mutationFn: (n: Note) => deleteNote(n.id),
        onSuccess: () => {
            setDeleting(null);
            refresh();
        },
    });

    return (
        <div className="space-y-3">
            {q.isPending ? <ListSkeleton rows={2} label="Loading notes"/>
                : q.error ? <ErrorState title="Couldn't load notes" error={q.error} onRetry={() => void q.refetch()}/>
                    : (q.data ?? []).length === 0 ? <p className="text-body-sm text-muted">No notes yet. Notes are private reminders for you.</p>
                        : (
                            <ul className="space-y-2">
                                {q.data!.map((n) => (
                                    <li key={n.id} className={`rounded-card border border-subtle p-3 ${n.doneAt ? "opacity-70" : ""}`}>
                                        <p className="text-body-sm whitespace-pre-wrap text-fg">{n.text}</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-caption whitespace-nowrap text-subtle" title={absolute(n.createdAt)}>{format(new Date(n.createdAt), "d MMM, HH:mm")}</span>
                                            {remindChip(n)}
                                            <span className="ml-auto flex">
                                                <button type="button" className="icon-btn size-11 text-muted" onClick={() => toggleDone.mutate(n)}
                                                        aria-label={n.doneAt ? "Mark as not done" : "Mark as done"} title={n.doneAt ? "Mark as not done" : "Mark as done"}>
                                                    <CheckIcon size={18}/>
                                                </button>
                                                <button type="button" className="icon-btn size-11 text-muted" aria-label="Edit note" title="Edit"
                                                        onClick={() => {
                                                            setEditing(n);
                                                            setText(n.text);
                                                            setRemindOn(n.remindOn ?? "");
                                                        }}>
                                                    <EditIcon size={18}/>
                                                </button>
                                                <button type="button" className="icon-btn size-11 text-muted" aria-label="Delete note" title="Delete"
                                                        onClick={() => setDeleting(n)}>
                                                    <TrashIcon size={18}/>
                                                </button>
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}

            <form className="space-y-3 rounded-card border border-subtle p-3" onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) save.mutate();
            }}>
                <label className="block">
                    <span className="mb-1 block text-body-sm font-semibold text-fg">{editing ? "Edit note" : "Add a note"}</span>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={3}
                              placeholder="What do you want to remember?"
                              className="w-full rounded-control border border-strong bg-surface px-3 py-2 text-body text-fg placeholder:text-subtle focus:border-primary focus:ring-3 focus:ring-focus/30 focus:outline-none"/>
                </label>
                <label className="block">
                    <span className="mb-1 block text-body-sm font-semibold text-fg">Remind me on (optional)</span>
                    <input type="date" value={remindOn} onChange={(e) => setRemindOn(e.target.value)}
                           className="min-h-11 w-full rounded-control border border-strong bg-surface px-3 text-body text-fg focus:border-primary focus:outline-none"/>
                </label>
                {save.error && <Callout tone="danger">{errorMessage(save.error, "The note couldn't be saved.")}</Callout>}
                <div className="flex gap-2">
                    {editing && (
                        <Button variant="secondary" size="lg" onClick={() => {
                            setEditing(null);
                            setText("");
                            setRemindOn("");
                        }}>Cancel</Button>
                    )}
                    <Button type="submit" size="lg" block disabled={!text.trim()} loading={save.isPending} loadingLabel="Saving…">
                        {editing ? "Save changes" : "Save note"}
                    </Button>
                </div>
            </form>

            <ConfirmDialog open={deleting !== null} title="Delete this note?" message="The note is removed for good."
                           pending={remove.isPending} error={remove.error ? errorMessage(remove.error, "The note couldn't be deleted.") : null}
                           onConfirm={() => deleting && remove.mutate(deleting)} onCancel={() => setDeleting(null)}/>
        </div>
    );
}
