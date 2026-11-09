import {tokenStorage} from "./auth/tokenStorage";

// When a session ends in the middle of editing, the page reloads to /login and what was typed would be gone. So the
// open form's unsaved values are put aside at that moment and restored on the way back. sessionStorage: this tab only,
// and only for the same account, so nobody else who signs in on this device sees them.

const KEY = "roomtrack.formDraft";

interface StoredDraft {
    path: string;
    user: string | null;
    values: unknown;
}

let current: unknown = null;

/** The open form's unsaved values, or null when there is nothing to keep. */
export function setCurrentFormDraft(values: unknown) {
    current = values;
}

function signedInUser(): string | null {
    try {
        const payload = tokenStorage.get()?.split(".")[1];
        if (!payload) return null;
        return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).sub ?? null;
    } catch {
        return null;
    }
}

/** Call before the token is cleared: the draft is tied to the account it belongs to. */
export function stashFormDraft(path: string) {
    if (current === null) return;
    try {
        const draft: StoredDraft = {path, user: signedInUser(), values: current};
        sessionStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
        // Storage unavailable: the user just starts the form again.
    }
}

/** The values put aside for this page and this account, if any. Reading doesn't remove them: see clearFormDraft. */
export function readFormDraft<T>(path: string): T | null {
    try {
        const draft = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as StoredDraft | null;
        const user = signedInUser();
        return draft && user !== null && draft.path === path && draft.user === user ? draft.values as T : null;
    } catch {
        return null;
    }
}

export function clearFormDraft() {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        // Nothing stored to clear.
    }
}
