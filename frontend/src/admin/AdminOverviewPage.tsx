// Overview. Phones: one section at a time (Summary, Attention, Onboarding, System) picked from a scrolling chip bar,
// the most important things on top. Desktop: everything in one view.
import {useState, type ReactNode} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {format} from "date-fns";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import {ButtonLink} from "../components/ui/Button";
import {ErrorState, ListSkeleton} from "../components/ui/States";
import {CheckIcon, ChevronRightIcon, RefreshIcon, WarningIcon} from "../components/icons";
import {getOverview, type AuditEntry, type FunnelStep, type Overview, type ReasonCode, type Reminder, type SystemStatus} from "./adminApi";
import AdminPageHeader from "./AdminPageHeader";
import {OwnerCards, OwnerTable} from "./AdminOwnerList";
import {ClockIcon, OkChip, ReasonChip, RelativeTime} from "./adminUi";
import {timeAgo} from "./adminFormat";
import {auditText} from "./auditText";

type Section = "summary" | "attention" | "onboarding" | "system";
const SECTIONS: { key: Section; label: string }[] = [
    {key: "summary", label: "Summary"},
    {key: "attention", label: "Attention"},
    {key: "onboarding", label: "Onboarding"},
    {key: "system", label: "System"},
];

const FUNNEL_LABELS: Record<string, string> = {
    registered: "Registered",
    emailVerified: "Email verified",
    propertyAdded: "Property added",
    unitAdded: "Unit added",
    calendarConnected: "Calendar connected",
    firstReservation: "First reservation",
};

const REASON_SHORT: Record<string, (n: number) => string> = {
    SYNC_FAILING: (n) => `${n} sync failing`,
    OPEN_CONFLICTS: (n) => `${n} open conflict${n === 1 ? "" : "s"}`,
    EMAIL_BOUNCED: (n) => `${n} email bounced`,
    UNVERIFIED_24H: (n) => `${n} email unverified`,
    STUCK_ONBOARDING: (n) => `${n} no setup`,
};

export default function AdminOverviewPage() {
    const [section, setSection] = useState<Section>("summary");
    const query = useQuery({queryKey: ["admin", "overview"], queryFn: getOverview});
    const o = query.data;

    const refresh = (
        <span className="flex items-center gap-3 text-body-sm text-muted">
            {query.dataUpdatedAt > 0 && <>Updated {timeAgo(new Date(query.dataUpdatedAt).toISOString())}</>}
            <button type="button" className="icon-btn size-11" aria-label="Refresh" onClick={() => void query.refetch()}
                    disabled={query.isFetching}>
                <RefreshIcon size={20} className={query.isFetching ? "animate-spin" : ""}/>
            </button>
        </span>
    );

    return (
        <>
            <AdminPageHeader title="Overview" actions={refresh}/>
            {query.isPending ? <ListSkeleton rows={4} label="Loading overview"/>
                : query.error && !o ? <ErrorState title="Couldn't load the overview" error={query.error} onRetry={() => void query.refetch()}/>
                    : o && (
                    <>
                        {/* Phones */}
                        <div className="lg:hidden">
                            <div role="tablist" aria-label="Overview sections" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
                                {SECTIONS.map((s) => (
                                    <button key={s.key} type="button" role="tab" aria-selected={section === s.key}
                                            onClick={() => setSection(s.key)}
                                            className={`min-h-11 shrink-0 rounded-full border px-4 text-body-sm font-semibold transition-colors ${
                                                section === s.key ? "border-primary bg-primary text-on-primary" : "border-default bg-surface text-fg"
                                            }`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                            <div role="tabpanel" aria-label={SECTIONS.find((s) => s.key === section)?.label}>
                                {section === "summary" && <MobileSummary o={o} onSystem={() => setSection("system")}/>}
                                {section === "attention" && (
                                    <>
                                        <SectionLabel aside="Most urgent first">{o.needHelp.total} owners need help</SectionLabel>
                                        {o.ownersNeedingHelp.length === 0 ? <AllGood/> : <OwnerCards owners={o.ownersNeedingHelp}/>}
                                        {o.needHelp.total > o.ownersNeedingHelp.length && (
                                            <ButtonLink to="/admin/owners?filter=attention" variant="secondary" block size="lg" className="mt-3">
                                                See all {o.needHelp.total}
                                            </ButtonLink>
                                        )}
                                    </>
                                )}
                                {section === "onboarding" && (
                                    <>
                                        <SectionLabel>Last 30 days</SectionLabel>
                                        <Card><Funnel steps={o.funnel}/></Card>
                                        <Stuck steps={o.funnel}/>
                                    </>
                                )}
                                {section === "system" && (
                                    <>
                                        <SectionLabel>Status</SectionLabel>
                                        <Card padding="none"><SystemList s={o.system}/></Card>
                                        <SectionLabel aside={<Link to="/admin/audit" className="font-semibold text-primary">Audit log</Link>}>
                                            Latest admin activity
                                        </SectionLabel>
                                        <Card><Activity items={o.latestActivity}/></Card>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Desktop */}
                        <div className="hidden space-y-5 lg:block">
                            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                                <Stat label="New owners, 7 days" value={o.newOwners7d}
                                      chip={<DeltaChip now={o.newOwners7d} before={o.newOwnersPrevious7d}/>}
                                      note={deltaNote(o.newOwners7d, o.newOwnersPrevious7d)}/>
                                <Stat label="Active owners, 7 days" value={o.activeOwners7d} note={`of ${o.totalOwners} in total`}/>
                                <Stat label="Need help" value={o.needHelp.total} note="sync, email or conflicts"
                                      chip={o.needHelp.total > 0 ? <Badge tone="danger" icon={<WarningIcon size={12}/>}>Act</Badge> : <OkChip/>}/>
                                <Stat label="Finished setup" value={`${o.finishedSetupPercent}%`}
                                      note={`${o.funnel.at(-1)?.count ?? 0} of ${o.funnelRegistered} new owners, 30 days`}/>
                            </div>
                            <div className="grid grid-cols-3 gap-5">
                                <Card padding="none" className="col-span-2">
                                    <CardHead title="Owners who need help"
                                              aside={o.needHelp.total > 0 && <Link to="/admin/owners?filter=attention" className="text-body-sm font-semibold text-primary">See all {o.needHelp.total}</Link>}/>
                                    {o.ownersNeedingHelp.length === 0 ? <div className="p-5"><AllGood/></div> : <div className="overflow-x-auto"><OwnerTable owners={o.ownersNeedingHelp} compact/></div>}
                                </Card>
                                <div className="space-y-5">
                                    <Card padding="none">
                                        <CardHead title="Reminders due"/>
                                        <div className="px-5 pb-4"><Reminders items={o.remindersDue}/></div>
                                    </Card>
                                    <Card padding="none">
                                        <CardHead title="System"/>
                                        <SystemList s={o.system}/>
                                    </Card>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-5">
                                <Card padding="none" className="col-span-2">
                                    <CardHead title="Onboarding, last 30 days"/>
                                    <div className="px-5 pb-5"><Funnel steps={o.funnel}/></div>
                                </Card>
                                <Card padding="none">
                                    <CardHead title="Latest admin activity" aside={<Link to="/admin/audit" className="text-body-sm font-semibold text-primary">Audit log</Link>}/>
                                    <div className="px-5 pb-4"><Activity items={o.latestActivity}/></div>
                                </Card>
                            </div>
                        </div>
                    </>
                )}
        </>
    );
}

function deltaNote(now: number, before: number): string {
    const d = now - before;
    if (d === 0) return "same as the week before";
    return `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} than the week before`;
}

function DeltaChip({now, before}: { now: number; before: number }) {
    const d = now - before;
    if (d === 0) return null;
    return <Badge tone={d > 0 ? "success" : "neutral"}>{d > 0 ? `+${d}` : d}</Badge>;
}

function SectionLabel({children, aside}: { children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="mt-5 mb-2 flex items-center justify-between gap-3 first:mt-0">
            <h2 className="text-micro font-semibold tracking-wider text-muted uppercase">{children}</h2>
            {aside && <span className="text-body-sm text-muted">{aside}</span>}
        </div>
    );
}

function CardHead({title, aside}: { title: string; aside?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 className="text-title-3 text-fg">{title}</h2>
            {aside}
        </div>
    );
}

function Stat({label, value, note, chip}: { label: string; value: ReactNode; note: string; chip?: ReactNode }) {
    return (
        <Card>
            <div className="flex items-start justify-between gap-2">
                <p className="text-body-sm font-medium text-muted">{label}</p>
                {chip}
            </div>
            <p className="num mt-1 text-[2.25rem] leading-tight font-bold text-fg">{value}</p>
            <p className="text-caption text-muted">{note}</p>
        </Card>
    );
}

function AllGood() {
    return <p className="flex items-center gap-2 text-body-sm text-muted"><CheckIcon size={16} className="text-success"/>Nobody needs help right now.</p>;
}

function MobileSummary({o, onSystem}: { o: Overview; onSystem: () => void }) {
    const reasons = Object.entries(o.needHelp.byReason).filter(([, n]) => n > 0);
    return (
        <>
            <SectionLabel>Last 7 days</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
                <Card>
                    <p className="text-body-sm text-muted">New owners</p>
                    <p className="num text-[2rem] leading-tight font-bold text-fg">{o.newOwners7d}</p>
                    <p className="text-caption text-muted">{deltaNote(o.newOwners7d, o.newOwnersPrevious7d)}</p>
                </Card>
                <Card>
                    <p className="text-body-sm text-muted">Active owners</p>
                    <p className="num text-[2rem] leading-tight font-bold text-fg">{o.activeOwners7d}</p>
                    <p className="text-caption text-muted">of {o.totalOwners} in total</p>
                </Card>
            </div>
            <Card className="mt-3">
                <div className="flex items-center gap-3">
                    <span className={`num flex size-12 shrink-0 items-center justify-center rounded-card text-title-1 font-bold ${
                        o.needHelp.total > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                    }`}>{o.needHelp.total}</span>
                    <div>
                        <p className="text-title-3 text-fg">{o.needHelp.total === 1 ? "Owner needs help" : "Owners need help"}</p>
                        <p className="text-caption text-muted">Most urgent first</p>
                    </div>
                </div>
                {reasons.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {reasons.map(([code, n]) => <ReasonChip key={code} code={code as ReasonCode} label={REASON_SHORT[code]?.(n)}/>)}
                    </div>
                )}
                <ButtonLink to="/admin/owners?filter=attention" block size="lg" className="mt-4">Review owners</ButtonLink>
            </Card>
            <SectionLabel>Reminders due</SectionLabel>
            <Card><Reminders items={o.remindersDue}/></Card>
            <button type="button" onClick={onSystem}
                    className="mt-3 flex min-h-16 w-full items-center gap-3 rounded-card border border-subtle bg-surface p-4 text-left">
                <SystemIcon state={o.system.state}/>
                <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-fg">{systemHeadline(o.system)}</span>
                    <span className="block text-caption text-muted">{backupLine(o.system)}</span>
                </span>
                <span className="text-body-sm font-semibold text-primary">Details</span>
            </button>
        </>
    );
}

function Reminders({items}: { items: Reminder[] }) {
    if (items.length === 0) return <p className="text-body-sm text-muted">No reminders due.</p>;
    const today = format(new Date(), "yyyy-MM-dd");
    return (
        <ul className="divide-y divide-(--rt-border-subtle)">
            {items.map((r) => {
                const overdueDays = Math.round((new Date(today).getTime() - new Date(r.remindOn).getTime()) / 86_400_000);
                return (
                    <li key={r.noteId}>
                        <Link to={`/admin/owners/${r.ownerId}`} className="flex min-h-14 items-center gap-3 py-2.5">
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-body-sm font-semibold text-fg">{r.text}</span>
                                <span className="block truncate text-caption text-muted">{r.ownerName || r.ownerEmail}</span>
                            </span>
                            {overdueDays > 0
                                ? <Badge tone="danger" icon={<ClockIcon size={12}/>}>Overdue {overdueDays} d</Badge>
                                : <Badge tone="warning" icon={<ClockIcon size={12}/>}>Today</Badge>}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

function Funnel({steps}: { steps: FunnelStep[] }) {
    return (
        <dl className="space-y-3">
            {steps.map((s) => (
                <div key={s.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[10rem_1fr_6rem]">
                    <dt className="text-body-sm text-fg">{FUNNEL_LABELS[s.key] ?? s.key}</dt>
                    <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-primary-soft">
                        <div className="h-full rounded-full bg-primary" style={{width: `${s.percent}%`}}/>
                    </div>
                    <dd className="num text-right text-body-sm font-semibold text-fg">{s.count} · {s.percent}%</dd>
                </div>
            ))}
        </dl>
    );
}

/** The biggest drop between two neighbouring funnel steps. */
function Stuck({steps}: { steps: FunnelStep[] }) {
    let worst: { from: FunnelStep; to: FunnelStep; lost: number } | null = null;
    for (let i = 1; i < steps.length; i++) {
        const lost = steps[i - 1].count - steps[i].count;
        if (lost > 0 && (!worst || lost > worst.lost)) worst = {from: steps[i - 1], to: steps[i], lost};
    }
    if (!worst) return null;
    return (
        <Card className="mt-3">
            <h3 className="text-title-3 text-fg">Where owners get stuck</h3>
            <p className="mt-1 text-body-sm text-muted">
                The biggest drop is between <strong className="text-fg">{FUNNEL_LABELS[worst.from.key]}</strong> and{" "}
                <strong className="text-fg">{FUNNEL_LABELS[worst.to.key]}</strong>: {worst.lost} owner{worst.lost === 1 ? "" : "s"}.
            </p>
            <ButtonLink to="/admin/owners?filter=attention" variant="secondary" block className="mt-3">Show owners who need help</ButtonLink>
        </Card>
    );
}

function systemHeadline(s: SystemStatus): string {
    if (s.state === "OK") return "All systems running";
    if (s.state === "ERROR") return s.backupState === "STALE" ? "Backup is out of date" : "Disk is almost full";
    return "Running, with warnings";
}

function backupLine(s: SystemStatus): string {
    return s.lastBackupAt ? `Last backup ${timeAgo(s.lastBackupAt)}` : "Last backup unknown";
}

function SystemIcon({state}: { state: SystemStatus["state"] }) {
    const cls = state === "OK" ? "bg-success-soft text-success" : state === "ERROR" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning";
    return (
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-control ${cls}`}>
            {state === "OK" ? <CheckIcon size={20}/> : <WarningIcon size={20}/>}
        </span>
    );
}

function bytes(n: number | null): string {
    if (n == null) return "unknown";
    if (n >= 1e9) return `${Math.round(n / 1e9)} GB`;
    if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
    return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

function SystemList({s}: { s: SystemStatus }) {
    const lowDisk = s.diskFreeBytes != null && s.diskTotalBytes != null && s.diskFreeBytes * 10 < s.diskTotalBytes;
    const rows: [string, ReactNode][] = [
        ["Backend", <OkChip key="b">Running</OkChip>],
        ["Last backup", s.backupState === "OK" && s.lastBackupAt
            ? <OkChip key="lb">{timeAgo(s.lastBackupAt)} · {bytes(s.lastBackupBytes)}</OkChip>
            : s.backupState === "STALE" && s.lastBackupAt
                ? <Badge key="lb" tone="danger" icon={<WarningIcon size={12}/>}>{timeAgo(s.lastBackupAt)}</Badge>
                : <Badge key="lb" tone="neutral" icon={<ClockIcon size={12}/>}>Unknown</Badge>],
        ["Calendars failing now", s.calendarsFailing > 0
            ? <Badge key="c" tone="warning" icon={<WarningIcon size={12}/>}>{s.calendarsFailing}</Badge> : <OkChip key="c">0</OkChip>],
        ["Emails failed, 24 h", s.emailsFailed24h > 0
            ? <Badge key="e" tone="warning" icon={<WarningIcon size={12}/>}>{s.emailsFailed24h}</Badge> : <OkChip key="e">0</OkChip>],
        ["Disk free", lowDisk
            ? <Badge key="d" tone="danger" icon={<WarningIcon size={12}/>}>{bytes(s.diskFreeBytes)}</Badge>
            : s.diskFreeBytes == null ? <Badge key="d" tone="neutral">Unknown</Badge> : <OkChip key="d">{bytes(s.diskFreeBytes)}</OkChip>],
        ["Database", <span key="db" className="num text-body-sm text-muted">{bytes(s.databaseBytes)}</span>],
        ["Version", <span key="v" className="num text-body-sm text-muted">{s.appVersion} · DB v{s.flywayVersion ?? "?"}</span>],
    ];
    return (
        <dl className="divide-y divide-(--rt-border-subtle)">
            {rows.map(([label, value]) => (
                <div key={label} className="flex min-h-11 items-center justify-between gap-3 px-5 py-2">
                    <dt className="text-body-sm text-fg">{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

function Activity({items}: { items: AuditEntry[] }) {
    if (items.length === 0) return <p className="text-body-sm text-muted">Nothing yet.</p>;
    return (
        <ul className="divide-y divide-(--rt-border-subtle)">
            {items.map((a) => (
                <li key={a.id} className="py-2.5">
                    {a.targetUserId && a.targetName ? (
                        <Link to={`/admin/owners/${a.targetUserId}`} className="flex items-center gap-2 text-body-sm font-semibold text-fg">
                            <span className="min-w-0 flex-1">{auditText(a)}</span><ChevronRightIcon size={16} className="text-subtle"/>
                        </Link>
                    ) : <p className="text-body-sm font-semibold text-fg">{auditText(a)}</p>}
                    <RelativeTime iso={a.createdAt} className="text-caption text-muted"/>
                </li>
            ))}
        </ul>
    );
}
