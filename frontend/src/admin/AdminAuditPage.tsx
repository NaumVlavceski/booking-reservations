// Audit log: read-only, newest first, 20 per page.
import {useState} from "react";
import {Link} from "react-router-dom";
import {keepPreviousData, useQuery} from "@tanstack/react-query";
import Card from "../components/ui/Card";
import Pager from "../components/ui/Pager";
import {ErrorState, ListSkeleton} from "../components/ui/States";
import {getAuditLog} from "./adminApi";
import AdminPageHeader from "./AdminPageHeader";
import {RelativeTime} from "./adminUi";
import {absolute} from "./adminFormat";
import {auditText} from "./auditText";

export default function AdminAuditPage() {
    const [page, setPage] = useState(0);
    const q = useQuery({queryKey: ["admin", "audit", page], queryFn: () => getAuditLog(page), placeholderData: keepPreviousData});
    return (
        <>
            <AdminPageHeader title="Audit log" back={{to: "/admin", label: "Overview"}}/>
            <p className="mb-4 text-body-sm text-muted">Everything done in Admin, newest first. Entries hold ids and counts only.</p>
            {q.isPending ? <ListSkeleton rows={6} label="Loading the audit log"/>
                : q.error && !q.data ? <ErrorState title="Couldn't load the audit log" error={q.error} onRetry={() => void q.refetch()}/>
                    : (
                        <>
                            <Card padding="none">
                                <ul className="divide-y divide-(--rt-border-subtle)">
                                    {q.data!.items.map((a) => (
                                        <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                                            {a.targetUserId && a.targetName
                                                ? <Link to={`/admin/owners/${a.targetUserId}`} className="text-body-sm font-semibold text-fg hover:underline">{auditText(a)}</Link>
                                                : <span className="text-body-sm font-semibold text-fg">{auditText(a)}</span>}
                                            <span className="text-caption text-muted" title={absolute(a.createdAt)}><RelativeTime iso={a.createdAt}/></span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                            <Pager page={page} totalPages={q.data!.totalPages} onChange={setPage} label="Audit log pages"/>
                        </>
                    )}
        </>
    );
}
