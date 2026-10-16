// What survives the jump to /login after a session ends: a "your session expired" note and the page to return to.
// sessionStorage, so it belongs to this tab only and is gone when the tab closes.
const EXPIRED_KEY = "roomtrack.sessionExpired";
const RETURN_KEY = "roomtrack.returnTo";

/** Only pages inside the app are allowed as return targets (no open redirects to other sites or odd paths). */
function isAppPath(path: string | null): path is string {
    return path !== null && path.startsWith("/dashboard") && !path.startsWith("//");
}

export function markSessionExpired(returnTo: string) {
    try {
        sessionStorage.setItem(EXPIRED_KEY, "1");
        if (isAppPath(returnTo)) sessionStorage.setItem(RETURN_KEY, returnTo);
    } catch {
        // Storage unavailable: the user just lands on the log-in page without the note.
    }
}

/** Whether the last session ended by expiring (read-only, so it's safe in render). */
export function wasSessionExpired(): boolean {
    try {
        return sessionStorage.getItem(EXPIRED_KEY) === "1";
    } catch {
        return false;
    }
}

/** Drops the note once it has been shown, so a later visit to /login doesn't repeat it. */
export function clearSessionExpired() {
    try {
        sessionStorage.removeItem(EXPIRED_KEY);
    } catch {
        // Nothing stored to clear.
    }
}

/** Where to go after logging in again; reading it clears it. */
export function takeReturnTo(fallback: string): string {
    try {
        const path = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
        return isAppPath(path) ? path : fallback;
    } catch {
        return fallback;
    }
}
