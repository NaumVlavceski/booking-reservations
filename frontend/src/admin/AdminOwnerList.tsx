import {Link} from "react-router-dom";
import {ChevronRightIcon} from "../components/icons";
import type {OwnerRow} from "./adminApi";
import {OwnerAvatar, ReasonChip, RelativeTime, shortDate, SyncChip, timeAgo} from "./adminUi";

function plural(n: number, word: string) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function seenLine(o: OwnerRow): string {
    const seen = o.lastSeenAt ? `Last seen ${timeAgo(o.lastSeenAt)}` : "Never signed in";
    const extra = o.lastSeenAt
        ? `${plural(o.counts.units, "unit")} · ${plural(o.counts.reservations, "reservation")}`
        : `registered ${shortDate(o.registeredAt)} · ${plural(o.counts.units, "unit")}`;
    return `${seen} · ${extra}`;
}

/** Phones: one card per owner. */
export function OwnerCards({owners}: { owners: OwnerRow[] }) {
    return (
        <ul className="space-y-3">
            {owners.map((o) => (
                <li key={o.id}>
                    <Link to={`/admin/owners/${o.id}`}
                          className="flex items-start gap-3 rounded-card border border-subtle bg-surface p-4 transition-colors hover:bg-surface-hover">
                        <OwnerAvatar name={o.name} email={o.email}/>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-body font-semibold text-fg">{o.name || "(no name)"}</span>
                            <span className="block truncate text-body-sm text-muted">{o.email}</span>
                            {o.attention.length > 0 && (
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                    {o.attention.map((c) => <ReasonChip key={c} code={c} row={o}/>)}
                                </span>
                            )}
                            <span className="mt-2 block text-caption text-subtle">{seenLine(o)}</span>
                        </span>
                        <ChevronRightIcon size={18} className="mt-3 shrink-0 text-subtle"/>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

/** Desktop: a table. Status is always a chip with an icon and a word. */
export function OwnerTable({owners, compact = false}: { owners: OwnerRow[]; compact?: boolean }) {
    return (
        <table className="w-full text-left text-body-sm">
            {!compact && (
                <thead className="border-b border-subtle text-micro font-semibold tracking-wider text-subtle uppercase">
                <tr>
                    <th scope="col" className="px-5 py-3">Owner</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3">Last seen</th>
                    <th scope="col" className="px-3 py-3 text-right">Units</th>
                    <th scope="col" className="px-3 py-3 text-right">Reservations</th>
                    <th scope="col" className="px-3 py-3 text-right">Sync</th>
                    <th scope="col" className="w-10 px-3 py-3"><span className="sr-only">Open</span></th>
                </tr>
                </thead>
            )}
            <tbody className="divide-y divide-(--rt-border-subtle)">
            {owners.map((o) => (
                <tr key={o.id} className="group relative transition-colors hover:bg-surface-hover">
                    <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                            <OwnerAvatar name={o.name} email={o.email}/>
                            <div className="min-w-0">
                                {/* The whole row opens the owner (the link's ::after covers it) */}
                                <Link to={`/admin/owners/${o.id}`}
                                      className="block truncate font-semibold text-fg after:absolute after:inset-0 after:content-['']">
                                    {o.name || "(no name)"}
                                </Link>
                                <p className="truncate text-caption text-muted">{o.email}</p>
                            </div>
                        </div>
                    </td>
                    <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">{o.attention.map((c) => <ReasonChip key={c} code={c} row={o}/>)}</div>
                    </td>
                    <td className="relative z-[1] px-3 py-3 whitespace-nowrap text-muted">
                        {o.lastSeenAt ? <RelativeTime iso={o.lastSeenAt}/> : "Never"}
                    </td>
                    {!compact && <td className="num px-3 py-3 text-right text-fg">{o.counts.units}</td>}
                    {!compact && <td className="num px-3 py-3 text-right text-fg">{o.counts.reservations}</td>}
                    {!compact && <td className="px-3 py-3 text-right"><SyncChip sync={o.sync}/></td>}
                    <td className="px-3 py-3 text-subtle"><ChevronRightIcon size={18}/></td>
                </tr>
            ))}
            </tbody>
        </table>
    );
}
