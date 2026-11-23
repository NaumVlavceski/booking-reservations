// Delete owner: lists what goes (counts from the server), warns twice, and keeps "Delete permanently" disabled until
// the owner's email is typed exactly (any letter case).
import {useRef, useState} from "react";
import {useMutation, useQuery} from "@tanstack/react-query";
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import {ListSkeleton} from "../components/ui/States";
import {TrashIcon} from "../components/icons";
import {errorMessage} from "../lib/errors";
import {deleteOwner, getDeletionSummary} from "./adminApi";

export default function DeleteOwnerDialog({open, onClose, onDeleted, ownerId, name, email}: {
    open: boolean;
    onClose: () => void;
    onDeleted: () => void;
    ownerId: string;
    name: string;
    email: string;
}) {
    const [typed, setTyped] = useState("");
    const cancelRef = useRef<HTMLButtonElement>(null);
    const summary = useQuery({
        queryKey: ["admin", "owner", ownerId, "deletion-summary"],
        queryFn: () => getDeletionSummary(ownerId),
        enabled: open,
        staleTime: 0,
        gcTime: 0,
    });
    const remove = useMutation({mutationFn: () => deleteOwner(ownerId, typed.trim()), onSuccess: onDeleted});

    // An empty confirmation field each time it opens (state adjusted during render when `open` changes, not in an effect)
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setTyped("");
    }

    const matches = typed.trim().toLowerCase() === email.toLowerCase();
    const s = summary.data;
    const rows: [string, number | string][] = s ? [
        ["Properties", s.properties],
        ["Units", s.units],
        ["Reservations", s.reservations],
        ["Calendar connections", s.calendarConnections],
        ["Emails in history", s.emailsInHistory],
        ["Your notes about this owner", s.notes],
        ["Sign-ins and sessions", "All"],
    ] : [];

    return (
        <Sheet open={open} onClose={onClose} role="alertdialog" dismissible={!remove.isPending} initialFocusRef={cancelRef}
               title={`Delete ${name}?`} description={email}
               icon={<span className="flex size-11 items-center justify-center rounded-card bg-danger-soft text-danger"><TrashIcon size={20}/></span>}
               footer={
                   <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                       <Button ref={cancelRef} variant="secondary" size="lg" onClick={onClose} disabled={remove.isPending}>Cancel</Button>
                       <Button variant="danger" size="lg" disabled={!matches || !s} loading={remove.isPending}
                               loadingLabel="Deleting…" onClick={() => remove.mutate()}>
                           Delete permanently
                       </Button>
                   </div>
               }>
            <div className="space-y-4">
                <Callout tone="danger">
                    <strong>This permanently removes the owner and everything they created. It cannot be undone.</strong>
                </Callout>
                <section aria-label="Will be deleted" className="rounded-card border border-subtle p-3">
                    <h3 className="mb-1 text-micro font-semibold tracking-wider text-muted uppercase">Will be deleted</h3>
                    {summary.isPending ? <ListSkeleton rows={3} label="Counting"/>
                        : summary.error ? <Callout tone="danger">{errorMessage(summary.error, "Couldn't count the owner's data.")}</Callout>
                            : (
                                <dl className="divide-y divide-(--rt-border-subtle)">
                                    {rows.map(([label, value]) => (
                                        <div key={label} className="flex min-h-9 items-center justify-between text-body-sm">
                                            <dt className="text-fg">{label}</dt>
                                            <dd className="num font-semibold text-fg">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                </section>
                <p className="text-body-sm text-muted">Backups can still hold a copy of this data for up to 7 days.</p>
                <label className="block">
                    <span className="mb-1 block text-body-sm font-semibold text-fg">Type the owner's email to confirm</span>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off"
                           spellCheck={false} placeholder={email}
                           className="min-h-12 w-full rounded-control border border-strong bg-surface px-3 text-body text-fg placeholder:text-subtle focus:border-danger focus:ring-3 focus:ring-danger/30 focus:outline-none"/>
                </label>
                {remove.error && <Callout tone="danger" role="alert">{errorMessage(remove.error, "The owner could not be deleted.")}</Callout>}
            </div>
        </Sheet>
    );
}
