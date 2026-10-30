import {useSyncExternalStore} from "react";
import axios from "axios";
import {useOnlineStatus} from "./useOnlineStatus";


let reachable = true;
const listeners = new Set<() => void>();

function set(next: boolean) {
    if (next === reachable) return;
    reachable = next;
    listeners.forEach((notify) => notify());
}

/** No answer at all: offline or the server is down. A timeout is not one (the server is there, just slow). */
export function isNetworkError(error: unknown): boolean {
    return axios.isAxiosError(error) && !error.response
        && error.code !== axios.AxiosError.ERR_CANCELED
        && error.code !== axios.AxiosError.ECONNABORTED
        && error.code !== axios.AxiosError.ETIMEDOUT;
}

export function reportApiError(error: unknown) {
    if (isNetworkError(error)) set(false);
}

export function reportApiSuccess() {
    set(true);
}

export function isApiReachable(): boolean {
    return reachable;
}

export function subscribeApiReachable(onChange: () => void) {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}

export function useApiReachable(): boolean {
    return useSyncExternalStore(subscribeApiReachable, isApiReachable, () => true);
}

/** Online and the server answers. When false, pages show what they already have and nothing can be changed. */
export function useConnected(): boolean {
    const online = useOnlineStatus();
    const apiReachable = useApiReachable();
    return online && apiReachable;
}
