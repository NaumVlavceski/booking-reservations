// The admin session token and its expiry. Kept in sessionStorage only (never localStorage): it dies with the tab,
// and it is useless without the owner's own token anyway. The server is the only judge of whether it is valid.
import {useSyncExternalStore} from "react";

export const ADMIN_SESSION_KEY = "rt_admin_session";

export interface AdminSession {
    token: string;
    /** ISO instants from the server. The countdown is computed from these, re-synced on every admin response. */
    expiresAt: string;
    maxExpiresAt: string;
}

const listeners = new Set<() => void>();
let cached: AdminSession | null | undefined;

function read(): AdminSession | null {
    if (cached !== undefined) return cached;
    try {
        const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
        cached = raw ? (JSON.parse(raw) as AdminSession) : null;
    } catch {
        cached = null;
    }
    return cached;
}

function emit() {
    listeners.forEach((l) => l());
}

export const adminSession = {
    get: read,
    set(session: AdminSession) {
        cached = session;
        try {
            sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
        } catch {
            // Private mode without storage: the session still lives in memory for this page
        }
        emit();
    },
    /** New expiry from a server response (Continue, or the headers on any admin call). */
    updateExpiry(expiresAt: string, maxExpiresAt?: string) {
        const current = read();
        if (!current || (current.expiresAt === expiresAt && (!maxExpiresAt || current.maxExpiresAt === maxExpiresAt))) return;
        adminSession.set({...current, expiresAt, maxExpiresAt: maxExpiresAt ?? current.maxExpiresAt});
    },
    clear() {
        cached = null;
        try {
            sessionStorage.removeItem(ADMIN_SESSION_KEY);
        } catch {
            // nothing stored
        }
        emit();
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

export function useAdminSession(): AdminSession | null {
    return useSyncExternalStore(adminSession.subscribe, adminSession.get, () => null);
}
