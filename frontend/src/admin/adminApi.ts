// The admin API (/api/admin/**). Every call goes through the normal client (owner token, refreshed tokens, sign-out
// on 401) and adds the admin session header. The server checks everything; nothing here is a secret.
import axios, {type AxiosRequestConfig, type AxiosResponse} from "axios";
import {apiClient, backgroundRequest} from "../lib/api/client";
import {errorCode} from "../lib/errors";
import {adminSession} from "./adminSession";

const BASE = "/api/admin";

function syncExpiry(res: AxiosResponse | undefined) {
    const expires = res?.headers?.["x-admin-session-expires"];
    const max = res?.headers?.["x-admin-session-max"];
    if (typeof expires === "string" && expires) adminSession.updateExpiry(expires, typeof max === "string" ? max : undefined);
}

/** The session is no longer accepted (expired, revoked, admin flag removed): back to the code dialog. */
async function checkSessionStillValid() {
    const s = adminSession.get();
    if (!s) return;
    try {
        await apiClient.get(`${BASE}/auth/session`, {headers: {...backgroundRequest.headers, "X-Admin-Session": s.token}});
    } catch (e) {
        if (axios.isAxiosError(e) && (e.response?.status === 403 || e.response?.status === 404)) adminSession.clear();
    }
}

async function call<T>(config: AxiosRequestConfig): Promise<T> {
    const s = adminSession.get();
    try {
        const res = await apiClient.request<T>({
            ...config,
            url: BASE + config.url,
            headers: {...(config.headers ?? {}), ...(s ? {"X-Admin-Session": s.token} : {})},
        });
        syncExpiry(res);
        return res.data;
    } catch (e) {
        if (axios.isAxiosError(e)) {
            syncExpiry(e.response);
            const status = e.response?.status;
            if (status === 403 && errorCode(e) === "ADMIN_SESSION_REQUIRED") adminSession.clear();
            // A 404 is either "no such owner" or "no admin access any more"; the session check tells them apart
            else if (status === 404) void checkSessionStillValid();
        }
        throw e;
    }
}

// ---------- types ----------

export type ReasonCode = "SYNC_FAILING" | "OPEN_CONFLICTS" | "EMAIL_BOUNCED" | "UNVERIFIED_24H" | "STUCK_ONBOARDING" | "INACTIVE_14D";
export type OwnerFilter = "attention" | "all" | "inactive14";
export type OwnerSort = "urgency" | "lastSeen" | "registered";

export interface Counts { properties: number; units: number; reservations: number }

export interface OwnerRow {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    registeredAt: string | null;
    lastSeenAt: string | null;
    emailVerified: boolean;
    counts: Counts;
    attention: ReasonCode[];
    sync: "NONE" | "OK" | "FAILING";
}

export interface OwnerPage {
    items: OwnerRow[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
    counts: { attention: number; all: number; inactive14: number };
}

export interface OwnerDetail {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    registeredAt: string | null;
    lastSeenAt: string | null;
    lastLoginAt: string | null;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    counts: Counts;
    calendars: number;
    openConflicts: number;
    attention: { code: ReasonCode; text: string }[];
}

export interface ReservationRow {
    id: string;
    unit: string;
    property: string;
    guestName: string | null;
    checkIn: string;
    checkOut: string;
    status: string;
    source: string;
    imported: boolean;
    calendar: string | null;
    price: number | null;
    importedWithoutPrice: boolean;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface ReservationPage { items: ReservationRow[]; page: number; size: number; total: number; hasMore: boolean }

export interface CalendarRow {
    id: string;
    platform: string;
    host: string;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    consecutiveFailures: number;
    importedReservations: number;
    failing: boolean;
}

export interface UnitCalendars { unitId: string; unit: string; property: string; outgoingFeed: boolean; calendars: CalendarRow[] }

export interface EmailRow {
    id: string;
    type: string;
    status: string;
    subject: string;
    to: string;
    createdAt: string;
    updatedAt: string | null;
    sentByAdmin: boolean;
    hasBody: boolean;
}

export interface EmailPage { items: EmailRow[]; page: number; size: number; total: number; hasMore: boolean }

export interface Note {
    id: string;
    ownerId: string;
    text: string;
    remindOn: string | null;
    doneAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Reminder { noteId: string; ownerId: string; ownerName: string | null; ownerEmail: string; text: string; remindOn: string }

export interface AuditEntry {
    id: string;
    action: string;
    targetUserId: string | null;
    targetName: string | null;
    details: Record<string, unknown>;
    createdAt: string;
}

export interface AuditPage { items: AuditEntry[]; page: number; size: number; totalElements: number; totalPages: number }

export interface SystemStatus {
    state: "OK" | "WARNING" | "ERROR";
    appVersion: string;
    flywayVersion: string | null;
    databaseBytes: number | null;
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
    emailsFailed24h: number;
    calendarsFailing: number;
    backupState: "OK" | "STALE" | "UNKNOWN";
    lastBackupAt: string | null;
    lastBackupBytes: number | null;
}

export interface FunnelStep { key: string; count: number; percent: number }

export interface Overview {
    newOwners7d: number;
    newOwnersPrevious7d: number;
    activeOwners7d: number;
    totalOwners: number;
    needHelp: { total: number; byReason: Record<string, number> };
    inactive14: number;
    ownersNeedingHelp: OwnerRow[];
    remindersDue: Reminder[];
    funnel: FunnelStep[];
    finishedSetupPercent: number;
    funnelRegistered: number;
    latestActivity: AuditEntry[];
    system: SystemStatus;
}

export interface SessionResponse { sessionToken: string | null; expiresAt: string; maxExpiresAt: string }

// ---------- step-up and session ----------

/** codeRequired is false only on a development backend without mail: then no code is sent or checked. */
export async function requestAdminCode(): Promise<{ sentTo: string; expiresInSeconds: number; resendAfterSeconds: number; codeRequired: boolean }> {
    return (await apiClient.post(`${BASE}/auth/request-code`)).data;
}

export async function verifyAdminCode(code: string): Promise<SessionResponse> {
    return (await apiClient.post<SessionResponse>(`${BASE}/auth/verify-code`, {code})).data;
}

export const extendAdminSession = () => call<SessionResponse>({method: "POST", url: "/auth/extend"});

/** Polling (phone woke up, tab came back): re-syncs the countdown; not activity. */
export const refreshAdminSession = () => call<SessionResponse>({method: "GET", url: "/auth/session", ...backgroundRequest});

/** Ends only the admin session. Never throws: the panel closes whatever the answer. */
export async function logoutAdmin(): Promise<void> {
    try {
        await call<void>({method: "POST", url: "/auth/logout"});
    } catch {
        // already ended
    }
}

// ---------- reads ----------

export const getOverview = () => call<Overview>({method: "GET", url: "/overview"});
export const getBadge = () => call<{ needHelp: number }>({method: "GET", url: "/badge", ...backgroundRequest});

export function getOwners(params: { query?: string; filter: OwnerFilter; sort?: OwnerSort; page: number; size: number },
                          signal?: AbortSignal) {
    return call<OwnerPage>({method: "GET", url: "/owners", params, signal});
}

export const getOwner = (id: string) => call<OwnerDetail>({method: "GET", url: `/owners/${id}`});
export const getOwnerReservations = (id: string, page: number, sort: "changed" | "checkin" = "changed") =>
    call<ReservationPage>({method: "GET", url: `/owners/${id}/reservations`, params: {page, size: 20, sort}});
export const getOwnerCalendars = (id: string) => call<UnitCalendars[]>({method: "GET", url: `/owners/${id}/calendars`});
export const getOwnerEmails = (id: string, page: number) =>
    call<EmailPage>({method: "GET", url: `/owners/${id}/emails`, params: {page, size: 20}});
export const getOwnerNotes = (id: string) => call<Note[]>({method: "GET", url: `/owners/${id}/notes`});
export const getFollowUps = () => call<Reminder[]>({method: "GET", url: "/follow-ups"});
export const getAuditLog = (page: number) => call<AuditPage>({method: "GET", url: "/audit-log", params: {page, size: 20}});
export const getSystem = () => call<SystemStatus>({method: "GET", url: "/system"});

// ---------- Send email and Delete owner (Batch C) ----------

export interface EmailConfig { enabled: boolean; from: string | null }

export interface DeletionSummary {
    properties: number;
    units: number;
    reservations: number;
    calendarConnections: number;
    emailsInHistory: number;
    notes: number;
    codes: number;
}

/** Not audited; the sender is fixed on the server and only shown. */
export const getEmailConfig = () => call<EmailConfig>({method: "GET", url: "/emails/config"});
/** The server never takes the sender from the request. */
export const sendAdminEmail = (body: { to: string; subject: string; message: string; ownerId?: string }) =>
    call<{ emailLogId: string | null; ownerId: string | null }>({method: "POST", url: "/emails/send", data: body});
export const getEmailBody = (ownerId: string, emailId: string) =>
    call<{ id: string; subject: string; body: string }>({method: "GET", url: `/owners/${ownerId}/emails/${emailId}`});
export const getDeletionSummary = (ownerId: string) =>
    call<DeletionSummary>({method: "GET", url: `/owners/${ownerId}/deletion-summary`});
export const deleteOwner = (ownerId: string, confirmEmail: string) =>
    call<DeletionSummary>({method: "DELETE", url: `/owners/${ownerId}`, data: {confirmEmail}});

// ---------- notes ----------

export const createNote = (ownerId: string, body: { text: string; remindOn: string | null }) =>
    call<Note>({method: "POST", url: `/owners/${ownerId}/notes`, data: body});
export const updateNote = (noteId: string, body: { text: string; remindOn: string | null; done: boolean }) =>
    call<Note>({method: "PATCH", url: `/notes/${noteId}`, data: body});
export const deleteNote = (noteId: string) => call<void>({method: "DELETE", url: `/notes/${noteId}`});
