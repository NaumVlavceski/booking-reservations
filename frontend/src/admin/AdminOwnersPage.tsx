// Owners: search (debounced 400 ms from 2 characters, Enter searches at once, older answers are cancelled), filter
// chips with counts, sorting, a table with numbered pages on desktop and cards with "Load 20 more" on phones (the same
// API call). Searching or changing the filter goes back to the first page.
import {useEffect, useRef, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {keepPreviousData, useInfiniteQuery, useQuery} from "@tanstack/react-query";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import {EmptyState, ErrorState, ListSkeleton} from "../components/ui/States";
import {SearchIcon} from "../components/icons";
import {useMediaQuery} from "../lib/useMediaQuery";
import {getOwners, type OwnerFilter, type OwnerPage, type OwnerSort} from "./adminApi";
import AdminPageHeader from "./AdminPageHeader";
import {OwnerCards, OwnerTable} from "./AdminOwnerList";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 400;

const FILTERS: { key: OwnerFilter; label: string; count: (p: OwnerPage["counts"]) => number }[] = [
    {key: "attention", label: "Needs help", count: (c) => c.attention},
    {key: "all", label: "All owners", count: (c) => c.all},
    {key: "inactive14", label: "Inactive 14+ days", count: (c) => c.inactive14},
];

function effectiveTerm(raw: string): string {
    const t = raw.trim();
    return t.length >= 2 ? t.slice(0, 100) : "";
}

export default function AdminOwnersPage() {
    const [params, setParams] = useSearchParams();
    const filter = (["attention", "all", "inactive14"].includes(params.get("filter") ?? "") ? params.get("filter") : "attention") as OwnerFilter;
    const sort = (params.get("sort") as OwnerSort | null) ?? undefined;
    const page = Math.max(0, Number(params.get("page") ?? 0) || 0);
    const [input, setInput] = useState(params.get("q") ?? "");
    const [term, setTerm] = useState(effectiveTerm(input));
    const desktop = useMediaQuery("(min-width: 1024px)");
    const timer = useRef<number | undefined>(undefined);

    function update(next: Record<string, string | null>) {
        const p = new URLSearchParams(params);
        for (const [k, v] of Object.entries(next)) {
            if (v === null || v === "") p.delete(k);
            else p.set(k, v);
        }
        setParams(p, {replace: true});
    }

    // Debounced search; a new term always starts at page 1
    useEffect(() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            const t = effectiveTerm(input);
            if (t !== term) {
                setTerm(t);
                update({q: t || null, page: null});
            }
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(timer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input]);

    function searchNow() {
        window.clearTimeout(timer.current);
        const t = effectiveTerm(input);
        setTerm(t);
        update({q: t || null, page: null});
    }

    // TanStack Query passes an AbortSignal: a newer search cancels the older request, so answers never arrive out of order
    const desktopQuery = useQuery({
        queryKey: ["admin", "owners", {term, filter, sort, page}],
        queryFn: ({signal}) => getOwners({query: term || undefined, filter, sort, page, size: PAGE_SIZE}, signal),
        placeholderData: keepPreviousData,
        enabled: desktop,
    });
    const mobileQuery = useInfiniteQuery({
        queryKey: ["admin", "owners-infinite", {term, filter, sort}],
        queryFn: ({pageParam, signal}) => getOwners({query: term || undefined, filter, sort, page: pageParam, size: PAGE_SIZE}, signal),
        initialPageParam: 0,
        getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
        enabled: !desktop,
    });

    const first: OwnerPage | undefined = desktop ? desktopQuery.data : mobileQuery.data?.pages[0];
    const items = desktop ? desktopQuery.data?.items ?? [] : mobileQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const loading = desktop ? desktopQuery.isPending : mobileQuery.isPending;
    const error = desktop ? desktopQuery.error : mobileQuery.error;
    const total = first?.totalElements ?? 0;
    const shownFrom = total === 0 ? 0 : (desktop ? page * PAGE_SIZE + 1 : 1);
    const shownTo = desktop ? Math.min(total, page * PAGE_SIZE + items.length) : items.length;

    return (
        <>
            <AdminPageHeader title="Owners"/>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center">
                <label className="relative block xl:w-[26rem] xl:shrink-0">
                    <span className="sr-only">Search owners</span>
                    <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-subtle"/>
                    <input type="search" value={input} maxLength={100} placeholder="Search by email, name or phone"
                           onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => {
                               if (e.key === "Enter") {
                                   e.preventDefault();
                                   searchNow();
                               }
                           }}
                           className="h-12 w-full rounded-control border border-strong bg-surface pr-4 pl-11 text-body text-fg placeholder:text-subtle focus:border-primary focus:ring-3 focus:ring-focus/30 focus:outline-none"/>
                </label>
                <div role="group" aria-label="Filter owners" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
                    {FILTERS.map((f) => {
                        const active = f.key === filter;
                        return (
                            <button key={f.key} type="button" aria-pressed={active}
                                    onClick={() => update({filter: f.key, page: null})}
                                    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-body-sm font-semibold transition-colors ${
                                        active ? "border-primary bg-primary text-on-primary" : "border-default bg-surface text-fg hover:bg-surface-hover"
                                    }`}>
                                {f.label}
                                {first && <span className="num">{f.count(first.counts)}</span>}
                            </button>
                        );
                    })}
                </div>
                <label className="flex items-center gap-2 text-body-sm text-muted xl:ml-auto">
                    Sort
                    <select value={sort ?? ""} onChange={(e) => update({sort: e.target.value || null, page: null})}
                            className="min-h-11 rounded-control border border-default bg-surface px-3 text-body-sm text-fg">
                        <option value="">{filter === "attention" ? "Most urgent" : "Registered"}</option>
                        <option value="lastSeen">Last seen</option>
                        <option value="registered">Registered</option>
                    </select>
                </label>
            </div>

            {loading ? <ListSkeleton rows={5} label="Loading owners"/>
                : error && items.length === 0 ? (
                    <ErrorState title="Couldn't load owners" error={error}
                                onRetry={() => void (desktop ? desktopQuery.refetch() : mobileQuery.refetch())}/>
                ) : items.length === 0 ? (
                    <EmptyState icon={<SearchIcon size={22}/>} title={term ? "No owners match" : "No owners here"}>
                        {term ? "Try another part of the name, email or phone." : "Nothing in this list right now."}
                    </EmptyState>
                ) : desktop ? (
                    <Card padding="none">
                        <div className="overflow-x-auto"><OwnerTable owners={items}/></div>
                        <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-3">
                            <p className="num text-body-sm text-muted" aria-live="polite">Showing {shownFrom}–{shownTo} of {total}</p>
                            <PageButtons page={page} totalPages={first?.totalPages ?? 1} onChange={(p) => update({page: p ? String(p) : null})}/>
                        </div>
                    </Card>
                ) : (
                    <>
                        <OwnerCards owners={items}/>
                        <p className="num mt-4 text-center text-body-sm text-muted" aria-live="polite">
                            Showing {shownFrom}–{shownTo} of {total}
                        </p>
                        {mobileQuery.hasNextPage && (
                            <Button variant="secondary" block size="lg" className="mt-3" onClick={() => void mobileQuery.fetchNextPage()}
                                    loading={mobileQuery.isFetchingNextPage} loadingLabel="Loading…">
                                Load {Math.min(PAGE_SIZE, total - items.length)} more
                            </Button>
                        )}
                    </>
                )}
        </>
    );
}

/** Previous, numbered pages (with gaps) and Next. */
function PageButtons({page, totalPages, onChange}: { page: number; totalPages: number; onChange: (p: number) => void }) {
    if (totalPages <= 1) return null;
    const pages = new Set([0, totalPages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < totalPages));
    const sorted = [...pages].sort((a, b) => a - b);
    return (
        <nav aria-label="Owner pages" className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</Button>
            {sorted.map((p, i) => (
                <span key={p} className="flex items-center gap-1.5">
                    {i > 0 && sorted[i - 1] !== p - 1 && <span className="text-subtle">…</span>}
                    <Button variant={p === page ? "primary" : "secondary"} size="sm" aria-current={p === page ? "page" : undefined}
                            onClick={() => onChange(p)} className="num min-w-9">{p + 1}</Button>
                </span>
            ))}
            <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>Next</Button>
        </nav>
    );
}
