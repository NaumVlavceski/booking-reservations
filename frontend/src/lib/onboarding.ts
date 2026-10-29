import {useSyncExternalStore} from "react";
import {useQuery} from "@tanstack/react-query";
import {meQuery} from "./api/me";
import {propertiesQuery} from "./api/properties";

export const ONBOARDING_PATH = "/dashboard/welcome";
export const ONBOARDING_STEPS = ["Property", "Rooms", "Channels"] as const;
export type OnboardingStep = 1 | 2 | 3;

/**
 * Where a new owner is in the guided setup. Kept per account on this device: whether setup is *needed*
 * comes from the data (no properties yet), this only remembers the step and that it was skipped or finished.
 */
export type OnboardingState =
    | { status: "active"; step: OnboardingStep; propertyId?: string }
    | { status: "skipped" | "done" };

const KEY_PREFIX = "roomtrack.onboarding.";
const listeners = new Set<() => void>();

function storageKey(email: string) {
    return KEY_PREFIX + email.toLowerCase();
}

function read(email: string | undefined): string | null {
    if (!email) return null;
    try {
        return localStorage.getItem(storageKey(email));
    } catch {
        return null;
    }
}

function parse(raw: string | null): OnboardingState | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as OnboardingState;
    } catch {
        return null;
    }
}

export function saveOnboarding(email: string, state: OnboardingState) {
    try {
        localStorage.setItem(storageKey(email), JSON.stringify(state));
    } catch {
        // Storage unavailable (private mode): setup may be offered again next visit, nothing breaks.
    }
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** This account's saved setup progress (null: never started on this device, or still loading). */
export function useOnboardingState(): { email: string | undefined; state: OnboardingState | null } {
    const {data: me} = useQuery(meQuery);
    // The raw string is the snapshot, so it only changes when the stored value does.
    const raw = useSyncExternalStore(subscribe, () => read(me?.email));
    return {email: me?.email, state: parse(raw)};
}

/** True once we know this owner has no properties yet and hasn't skipped or finished the setup. */
export function useNeedsOnboarding(): boolean {
    const {email, state} = useOnboardingState();
    const {data: properties} = useQuery(propertiesQuery);
    if (!email || !properties) return false;
    return properties.length === 0 && (state === null || state.status === "active");
}
