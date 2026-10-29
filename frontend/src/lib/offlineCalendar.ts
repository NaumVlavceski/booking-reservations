import {hashKey, type QueryClient, type QueryKey} from "@tanstack/react-query";
import {isApiReachable, subscribeApiReachable} from "./apiReachability";

// The calendar stays readable without a connection: the last data it loaded (account, properties, rooms,
// bookings) is saved on this device after every successful load. It is only put back on screen while offline
// or while the server doesn't answer, never instead of live data, and nothing can be changed from it.
// Deleted on log-out and when the session ends.

const STORAGE_KEY = "roomtrack.offlineCalendar";
const SAVE_DELAY_MS = 500;

interface SavedQuery {
    queryKey: QueryKey;
    data: unknown;
    updatedAt: number;
}

let keptHashes = new Set<string>();

/** One of the queries the offline calendar is made from (kept in memory and on this device). */
export function isKeptOffline(queryKey: QueryKey): boolean {
    return keptHashes.has(hashKey(queryKey));
}

function read(): SavedQuery[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as SavedQuery[]) : [];
    } catch {
        return [];
    }
}

function save(queryClient: QueryClient) {
    const saved = queryClient.getQueryCache().getAll()
        .filter((query) => isKeptOffline(query.queryKey) && query.state.data !== undefined)
        .map((query): SavedQuery => ({queryKey: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt}));
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
        // Storage full or unavailable (private mode): the calendar just isn't available offline.
    }
}

/** Fills in whatever the app doesn't have in memory from the saved copy (the app started offline, say). */
function restore(queryClient: QueryClient) {
    for (const {queryKey, data, updatedAt} of read()) {
        if (isKeptOffline(queryKey) && queryClient.getQueryData(queryKey) === undefined) {
            queryClient.setQueryData(queryKey, data, {updatedAt});
        }
    }
}

/** Saves these queries after every successful load and brings them back while offline. Called once at start-up. */
export function keepOffline(queryClient: QueryClient, queryKeys: QueryKey[]) {
    keptHashes = new Set(queryKeys.map((queryKey) => hashKey(queryKey)));
    // Never dropped from memory either, so the calendar still has them after a long time on other pages.
    queryKeys.forEach((queryKey) => queryClient.setQueryDefaults(queryKey, {gcTime: Infinity}));

    if (!navigator.onLine) restore(queryClient);
    window.addEventListener("offline", () => restore(queryClient));
    subscribeApiReachable(() => {
        if (!isApiReachable()) {
            restore(queryClient);
        } else {
            // The server answers again: replace what may be the saved copy with live data.
            void queryClient.invalidateQueries({predicate: (query) => isKeptOffline(query.queryKey)});
        }
    });

    let timer: number | undefined;
    queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success" || !isKeptOffline(event.query.queryKey)) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => save(queryClient), SAVE_DELAY_MS);
    });
}

/** Whether the calendar has everything it needs to show (live or saved). */
export function hasOfflineCalendar(queryClient: QueryClient): boolean {
    const cache = queryClient.getQueryCache();
    return keptHashes.size > 0 && [...keptHashes].every((hash) => cache.get(hash)?.state.data !== undefined);
}

/** Deletes the saved copy from this device (log-out, session over). */
export function clearOfflineCalendar() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing stored to remove.
    }
}
