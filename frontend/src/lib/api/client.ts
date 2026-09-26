import axios from "axios";
import {tokenStorage} from "../auth/tokenStorage";

/** The backend's human-readable `message` from an error response, if it sent one. */
export function apiErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError<{ message?: string }>(error)) {
        return error.response?.data?.message ?? fallback;
    }
    return fallback;
}

export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
});

apiClient.interceptors.request.use((config) => {
    const token = tokenStorage.get();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        if ((status === 401 || status === 403) && window.location.pathname !== "/login") {
            tokenStorage.clear();
            window.location.href = "/login";
        }

        return Promise.reject(error);
    }
);
