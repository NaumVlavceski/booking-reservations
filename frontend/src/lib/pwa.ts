import {useSyncExternalStore} from "react";

// Installing RoomTrack as an app. Chrome/Edge (Android, desktop) fire `beforeinstallprompt`, which we keep so
// our own "Install app" button can open the install dialog. iPhone/iPad have no such event: there you add the
// site to the home screen from the Share menu, so we explain that instead. Imported from main.tsx before the
// app renders, so the event is never missed.

/** Chrome's install event (not in TypeScript's DOM types). */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** How this browser can install the app: our button opens Chrome's dialog, the iOS Share menu, or not at all. */
export type InstallMethod = "prompt" | "ios" | null;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isStandalone(): boolean {
    return window.matchMedia("(display-mode: standalone)").matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
    // iPadOS reports itself as a Mac; touch support gives it away.
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function computeMethod(): InstallMethod {
    if (installedNow || isStandalone()) return null;
    if (deferredPrompt) return "prompt";
    return isIos() ? "ios" : null;
}

let method = computeMethod();

function update() {
    method = computeMethod();
    listeners.forEach((notify) => notify());
}

window.addEventListener("beforeinstallprompt", (event) => {
    // Our button and banner instead of Chrome's own mini bar. Chrome's menu still offers "Install app".
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    update();
});
window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedNow = true;
    update();
});
window.matchMedia("(display-mode: standalone)").addEventListener("change", update);

/** How the app can be installed here, or null when it can't (already installed, unsupported browser). */
export function useInstallMethod(): InstallMethod {
    return useSyncExternalStore(
        (onChange) => {
            listeners.add(onChange);
            return () => listeners.delete(onChange);
        },
        () => method,
        () => null,
    );
}

/** Opens Chrome's install dialog. Each saved event works once; Chrome sends a new one if the user says no. */
export async function promptInstall(): Promise<void> {
    const event = deferredPrompt;
    if (!event) return;
    deferredPrompt = null;
    update();
    await event.prompt();
    await event.userChoice;
}

// The install banner (Chrome) appears at most once a week; the iPhone hint stays away once closed.
const BANNER_SHOWN_KEY = "roomtrack.installBanner.lastShown";
const IOS_HINT_CLOSED_KEY = "roomtrack.iosInstallHint.closed";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage unavailable (private mode): the banner may come back next visit, nothing breaks.
    }
}

// Decided once per page load, so the banner doesn't vanish the moment we record that it was shown.
const bannerDueThisVisit = Date.now() - Number(readStorage(BANNER_SHOWN_KEY) ?? 0) > WEEK_MS;

export const installBanner = {
    isDue: () => bannerDueThisVisit,
    markShown: () => writeStorage(BANNER_SHOWN_KEY, String(Date.now())),
};

export const iosInstallHint = {
    isClosed: () => readStorage(IOS_HINT_CLOSED_KEY) !== null,
    close: () => writeStorage(IOS_HINT_CLOSED_KEY, "1"),
};
