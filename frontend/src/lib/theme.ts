import {useSyncExternalStore} from "react";

export type Theme = "light" | "dark";

// The theme each account chose, saved in this browser, plus the last one shown (used before we know who is
// signed in, e.g. on the log-in page; index.html applies it before the first paint). Default: light.
const LAST_KEY = "roomtrack.theme";
const accountKey = (email: string) => `roomtrack.theme.${email.trim().toLowerCase()}`;
// Browser bar colour per theme (tokens.css --rt-surface).
const BAR_COLOR: Record<Theme, string> = {light: "#FFFFFF", dark: "#111A27"};

const listeners = new Set<() => void>();

function read(key: string): Theme | null {
    try {
        const value = localStorage.getItem(key);
        return value === "dark" || value === "light" ? value : null;
    } catch {
        return null;
    }
}

function write(key: string, theme: Theme) {
    try {
        localStorage.setItem(key, theme);
    } catch {
        // Storage unavailable (private mode): the theme still applies for this visit.
    }
}

function current(): Theme {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Shows the page in this theme and remembers it as the last one used. */
export function applyTheme(theme: Theme) {
    if (theme === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOR[theme]);
    write(LAST_KEY, theme);
    listeners.forEach((notify) => notify());
}

/** Switches to the theme this account saved (light if it never chose one). */
export function applyAccountTheme(email: string) {
    applyTheme(read(accountKey(email)) ?? "light");
}

/** The current theme, and a setter that also saves it for this account. */
export function useTheme(email: string | undefined): [Theme, (theme: Theme) => void] {
    const theme = useSyncExternalStore(
        (onChange) => {
            listeners.add(onChange);
            return () => listeners.delete(onChange);
        },
        current,
        () => "light" as Theme,
    );
    function setTheme(next: Theme) {
        if (email) write(accountKey(email), next);
        applyTheme(next);
    }
    return [theme, setTheme];
}
