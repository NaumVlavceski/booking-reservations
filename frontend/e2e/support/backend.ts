// Talks to the LOCAL E2E stack only: the API through the UI server's proxy (or straight to the container) and the
// database through `docker exec audit-fe-db psql`. Used by the seed and by specs that need their own owner.
// Plain TypeScript without TS-only syntax, so `node e2e/stack/seed.ts` runs it directly (Node 24 strips types).
import {execFileSync, spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";

export const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:18081";
export const DB_CONTAINER = `${process.env.E2E_PREFIX ?? "audit-fe-"}db`;
export const API_CONTAINER = `${process.env.E2E_PREFIX ?? "audit-fe-"}api`;

for (const url of [API_URL, process.env.E2E_BASE_URL ?? ""]) {
    if (/roomtrack\.app/i.test(url)) throw new Error(`E2E refuses to talk to ${url}: local stack only`);
}

/** Test password used for every seeded account (throwaway local DB only). */
export const TEST_PASSWORD = "E2e-test-Passw0rd!";

export function psql(sql: string): string {
    return execFileSync("docker", ["exec", "-i", "-e", "PGOPTIONS=--client-min-messages=warning", DB_CONTAINER, "psql", "-U", "e2e", "-d", "roomtrack_e2e",
        "-At", "-v", "ON_ERROR_STOP=1", "-q"], {input: sql, encoding: "utf8"}).trim();
}

export const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

export interface ApiResult<T = unknown> {
    status: number;
    body: T;
    headers: Headers;
}

export async function api<T = unknown>(method: string, path: string, token?: string | null, body?: unknown): Promise<ApiResult<T>> {
    const res = await fetch(API_URL + path, {
        method,
        headers: {
            ...(body !== undefined ? {"content-type": "application/json"} : {}),
            ...(token ? {authorization: `Bearer ${token}`} : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        // not JSON
    }
    return {status: res.status, body: parsed as T, headers: res.headers};
}

export async function apiOk<T = unknown>(method: string, path: string, token?: string | null, body?: unknown): Promise<T> {
    const res = await api<T>(method, path, token, body);
    if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
}

export async function login(email: string, password = TEST_PASSWORD): Promise<string> {
    const res = await apiOk<{token: string}>("POST", "/api/auth/login", null, {email, password});
    return res.token;
}

/** Registers through the API like the app does, then marks the address verified in the DB (no email is sent). */
export async function createVerifiedOwner(opts: {email?: string; fullName?: string; password?: string} = {}) {
    const email = (opts.email ?? `e2e-${randomUUID().slice(0, 8)}@example.test`).toLowerCase();
    const password = opts.password ?? TEST_PASSWORD;
    const reg = await api("POST", "/api/auth/register", null, {
        email, password, fullName: opts.fullName ?? "E2E Owner", contactPhone: "+389 70 000 000",
        acceptedTerms: true, termsVersion: "2026-10-31", privacyVersion: "2026-10-31",
    });
    if (reg.status !== 202) throw new Error(`register ${email} → ${reg.status} ${JSON.stringify(reg.body)}`);
    psql(`UPDATE app_user SET email_verified_at = now() WHERE email = ${sqlString(email)};`);
    const token = await login(email, password);
    return {email, password, token};
}

export interface Property {id: string; name: string}
export interface Unit {id: string; propertyId: string; name: string; capacity: number; token: string}
export interface Reservation {id: string; unitId: string; checkIn: string; checkOut: string; status: string; guestName: string}

export async function createProperty(token: string, name: string, unitCount: number, address = ""): Promise<{property: Property; units: Unit[]}> {
    const property = await apiOk<Property>("POST", "/api/properties", token, {name, address, unitCount});
    const units = await apiOk<Unit[]>("GET", `/api/properties/${property.id}/units`, token);
    units.sort((a, b) => a.name.localeCompare(b.name, "en", {numeric: true}));
    return {property, units};
}

export async function renameUnit(token: string, unit: Unit, name: string, capacity = 4): Promise<Unit> {
    return apiOk<Unit>("PUT", `/api/units/${unit.id}`, token, {name, capacity});
}

export interface NewReservation {
    unitId: string;
    checkIn: string;
    checkOut: string;
    status?: "CONFIRMED" | "PAID" | "BLOCK";
    guestName?: string;
    guestsCount?: number;
    totalAmount?: number | null;
    nightlyRate?: number | null;
    pricePerGuest?: number | null;
    guestEmail?: string;
    guestPhone?: string;
    notes?: string;
}

export async function createReservation(token: string, r: NewReservation): Promise<Reservation> {
    return apiOk<Reservation>("POST", "/api/reservations", token, {
        status: "CONFIRMED", guestName: "", guestsCount: 2, guestEmail: "", guestPhone: "", notes: "",
        pricePerGuest: null, nightlyRate: null, totalAmount: null, ...r,
    });
}

export async function listReservations(token: string, unitId?: string): Promise<Reservation[]> {
    return apiOk<Reservation[]>("GET", `/api/reservations${unitId ? `?unitId=${unitId}` : ""}`, token);
}

/** yyyy-MM-dd for today + n days in the machine's local zone (the browser runs in the same zone). */
export function day(n: number, from = new Date()): string {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The newest verification code the backend logged for this address (profile "local" with mail off logs codes). */
export function codeFromLogs(email: string): string | null {
    const res = spawnSync("docker", ["logs", "--tail", "500", API_CONTAINER], {encoding: "utf8"});
    const lines = `${res.stdout}\n${res.stderr}`.split(/\r?\n/)
        .filter((l) => l.includes("verification code for " + email + ":"));
    const m = lines.at(-1)?.match(/: (\d{6})\s*$/);
    return m ? m[1] : null;
}
