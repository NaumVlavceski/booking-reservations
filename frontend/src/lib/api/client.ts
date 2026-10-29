import axios, {type AxiosResponse} from "axios";
import {tokenStorage} from "../auth/tokenStorage";
import {markSessionExpired} from "../auth/session";
import {clearOfflineCalendar} from "../offlineCalendar";

/** The backend's human-readable `message` from an error response, if it sent one. */
export function apiErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError<{ message?: string }>(error)) {
        return error.response?.data?.message ?? fallback;
    }
    return fallback;
}

/** The backend's stable machine-readable `code` (e.g. EMAIL_NOT_VERIFIED), if it sent one. */
export function apiErrorCode(error: unknown): string | undefined {
    if (axios.isAxiosError<{ code?: string }>(error)) return error.response?.data?.code;
    return undefined;
}

export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
});

/**
 * Request options for automatic calls (polling): the backend doesn't count them as activity, so an idle
 * session still expires. Calls the user triggers must not use this.
 */
export const backgroundRequest = {headers: {"X-Background": "true"}} as const;

apiClient.interceptors.request.use((config) => {
    const token = tokenStorage.get();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Sliding session: the backend sends a fresh token in this header while the user is active.
function keepRefreshedToken(response?: AxiosResponse) {
    const refreshed = response?.headers?.["x-refreshed-token"];
    if (typeof refreshed === "string" && refreshed) tokenStorage.set(refreshed);
}

// Several requests can fail at once when a session ends: only the first one sends the user to log in.
let sessionEnding = false;

function endSession() {
    if (sessionEnding) return;
    sessionEnding = true;
    tokenStorage.clear();
    clearOfflineCalendar();
    const {pathname, search, hash} = window.location;
    markSessionExpired(pathname + search + hash);
    window.location.replace("/login");
}

apiClient.interceptors.response.use(
    (response) => {
        keepRefreshedToken(response);
        return response;
    },
    (error) => {
        keepRefreshedToken(error.response);
        const sentToken = Boolean(error.config?.headers?.Authorization);
        const isAuthCall = String(error.config?.url ?? "").startsWith("/api/auth/");
        // 401 = the session is over (expired, logged out everywhere, account disabled). A wrong password on
        // the log-in call is also a 401 but not a session ending. 403 means "not allowed" and keeps you signed in.
        if (error.response?.status === 401 && sentToken && !isAuthCall) {
            endSession();
        }

        return Promise.reject(error);
    }
);
