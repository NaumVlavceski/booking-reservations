import axios, {type AxiosError} from "axios";
import {formatStay} from "./dates";



interface ApiErrorBody {
    message?: string;
    code?: string;
    fieldErrors?: Record<string, string>;
    room?: string;
    takenFrom?: string;
    takenTo?: string;
}

export type ErrorKind =
    | "network" | "timeout" | "session" | "forbidden" | "notFound" | "datesTaken" | "conflict"
    | "validation" | "rateLimited" | "server" | "badRequest" | "unknown";

const MESSAGES: Record<ErrorKind, string> = {
    network: "Can't reach RoomTrack. Check your internet connection and try again.",
    timeout: "This is taking longer than usual. Please try again.",
    session: "Your session expired. Please sign in again.",
    forbidden: "You don't have access to this.",
    notFound: "We couldn't find that. It may have been deleted.",
    datesTaken: "Those dates are already booked. Pick other dates or another room.",
    conflict: "This was changed in the meantime. Reload the page and try again.",
    validation: "Some details need fixing. Check the highlighted fields.",
    rateLimited: "Too many attempts. Please wait a minute and try again.",
    server: "Something went wrong on our side. Please try again in a moment.",
    badRequest: "That didn't work. Please check the details and try again.",
    unknown: "Something went wrong. Please try again.",
};

const TECHNICAL = /[Mm]alformed|[Ii]nvalid value for|[Rr]equired (request )?(parameter|body)|[Nn]o static resource|not supported|(^|\s)'[^']+'|\b[A-Z]{4,}\b/;

function apiError(error: unknown): AxiosError<ApiErrorBody> | null {
    return axios.isAxiosError<ApiErrorBody>(error) ? error : null;
}

function isTimeout(error: AxiosError): boolean {
    return error.code === axios.AxiosError.ECONNABORTED || error.code === axios.AxiosError.ETIMEDOUT;
}

function isAuthCall(error: AxiosError): boolean {
    return String(error.config?.url ?? "").startsWith("/api/auth/");
}

export function errorKind(error: unknown): ErrorKind {
    const err = apiError(error);
    if (!err) return "unknown";
    if (!err.response) {
        if (isTimeout(err)) return "timeout";
        return "network";
    }
    const {status, data} = err.response;
    switch (data?.code) {
        case "DATES_TAKEN": return "datesTaken";
        case "VALIDATION_FAILED": return "validation";
        case "RATE_LIMITED": return "rateLimited";
        case "NOT_FOUND": return "notFound";
        case "CONFLICT": return "conflict";
        case "INTERNAL": return "server";
    }
    if (status === 401) return isAuthCall(err) ? "badRequest" : "session";
    if (status === 403) return "forbidden";
    if (status === 404) return "notFound";
    if (status === 408) return "timeout";
    if (status === 409) return "conflict";
    if (status === 429) return "rateLimited";
    if (status >= 500) return "server";
    if (status >= 400) return "badRequest";
    return "unknown";
}

/** The backend's stable machine-readable `code` (e.g. EMAIL_NOT_VERIFIED), if it sent one. */
export function errorCode(error: unknown): string | undefined {
    return apiError(error)?.response?.data?.code;
}

/** The server's own message when it is written for people (business rules, wrong password…), else null. */
function serverMessage(error: unknown): string | null {
    const message = apiError(error)?.response?.data?.message?.trim();
    if (!message || TECHNICAL.test(message)) return null;
    return message;
}

/** "Room 2 is already booked 12–15 Nov. Pick other dates or another room." */
function datesTakenMessage(error: unknown): string {
    const data = apiError(error)?.response?.data;
    if (!data?.room || !data.takenFrom || !data.takenTo) return MESSAGES.datesTaken;
    return `${data.room} is already booked ${formatStay(data.takenFrom, data.takenTo)}. Pick other dates or another room.`;
}

/**
 * Why it failed and what to do, without saying what failed: for places whose title already does
 * ("Couldn't load bookings" + this).
 */
export function errorReason(error: unknown): string {
    const kind = errorKind(error);
    switch (kind) {
        case "datesTaken":
            return datesTakenMessage(error);
        case "validation":
            return fieldErrors(error) ? MESSAGES.validation : serverMessage(error) ?? MESSAGES.badRequest;
        case "badRequest":
        case "conflict":
            return serverMessage(error) ?? MESSAGES[kind];
        default:
            return MESSAGES[kind];
    }
}

/**
 * The full sentence for a failed action: what didn't happen (`failed`, e.g. "Couldn't save the booking.") and why.
 * When the server explains a rule the user broke ("Check-out must be after check-in"), that explanation is enough.
 */
export function errorMessage(error: unknown, failed: string): string {
    const kind = errorKind(error);
    if (kind === "datesTaken" || ((kind === "badRequest" || kind === "conflict" || kind === "validation") && serverMessage(error))) {
        return errorReason(error);
    }
    return `${failed} ${errorReason(error)}`;
}

/** Messages to show next to form fields, keyed by the request's field names, or null when there are none. */
export function fieldErrors(error: unknown): Record<string, string> | null {
    const errors = apiError(error)?.response?.data?.fieldErrors;
    return errors && Object.keys(errors).length > 0 ? errors : null;
}

/** True when the request never got an answer (offline, server down, timeout): the action did not go through. */
export function isConnectionError(error: unknown): boolean {
    const kind = errorKind(error);
    return kind === "network" || kind === "timeout";
}

/** Technical details for developers. Never shown in the UI. */
export function logError(error: unknown, where?: string) {
    const err = apiError(error);
    if (err) {
        const {method, url} = err.config ?? {};
        console.error(`[RoomTrack]${where ? ` ${where}:` : ""} ${method?.toUpperCase() ?? ""} ${url ?? ""}`,
            err.response?.status ?? err.code, err.response?.data ?? err.message);
    } else {
        console.error(`[RoomTrack]${where ? ` ${where}:` : ""}`, error);
    }
}
