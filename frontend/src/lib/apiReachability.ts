import {useSyncExternalStore} from "react";
import axios from "axios";


let reachable = true;
const listeners = new Set<() => void>();

function set(next: boolean) {
    if (next === reachable) return;
    reachable = next;
    listeners.forEach((notify) => notify());
}

export function isNetworkError(error: unknown): boolean {
    return axios.isAxiosError(error) && !error.response && error.code !== axios.AxiosError.ERR_CANCELED;
}

export function reportApiError(error: unknown) {
    if (isNetworkError(error)) set(false);
}

export function reportApiSuccess() {
    set(true);
}

export function useApiReachable(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            listeners.add(onChange);
            return () => listeners.delete(onChange);
        },
        () => reachable,
        () => true,
    );
}
