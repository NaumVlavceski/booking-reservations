import axios, {type AxiosResponse} from "axios";
import {tokenStorage} from "../auth/tokenStorage";
import {markSessionExpired} from "../auth/session";
import {clearOfflineCalendar} from "../offlineCalendar";

// Error wording for the user lives in lib/errors.ts.

/** A request with no answer by then fails with "This is taking longer than usual" instead of spinning forever. */
const REQUEST_TIMEOUT_MS = 20_000;
/** For calls that legitimately take long: syncing with Booking.com, building the Excel file. */
export const slowRequest = {timeout: 60_000} as const;

export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
    timeout: REQUEST_TIMEOUT_MS,
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
            // The page is being replaced by the log-in page: settle never, so no error flashes on the way out.
            return new Promise(() => {});
        }

        return Promise.reject(error);
    }
);
