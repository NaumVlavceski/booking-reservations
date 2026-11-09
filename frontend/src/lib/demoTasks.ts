// The demo's checklist: which tasks this visitor has done, kept in this browser (a demo only lasts an hour).
// Tasks are ticked by watching real API answers, so a task is only done when the server really did it.

import {useSyncExternalStore} from "react";
import axios, {type AxiosResponse} from "axios";
import type {QueryClient} from "@tanstack/react-query";
import {apiClient} from "./api/client";
import type {ReservationResponse} from "./api/reservations";

export type DemoTaskId = "add" | "price" | "dates" | "guests" | "copy" | "move" | "cancel" | "paid" | "room"
    | "restore" | "doubleBook" | "export" | "guide";

const KEY_PREFIX = "roomtrack.demoTasks.";
const ONE_BOOKING = /^\/api\/reservations\/([^/]+)$/;
const NO_TASKS: ReadonlySet<DemoTaskId> = new Set();

let storageKey: string | null = null;
let done: ReadonlySet<DemoTaskId> = NO_TASKS;
const listeners = new Set<() => void>();

function setDone(next: ReadonlySet<DemoTaskId>) {
    done = next;
    listeners.forEach((listener) => listener());
}

/** Loads this demo's progress. Each demo has its own address, so what an earlier demo left here is removed. */
export function loadDemoTasks(email: string) {
    storageKey = KEY_PREFIX + email.toLowerCase();
    let saved: DemoTaskId[] = [];
    try {
        Object.keys(localStorage)
            .filter((key) => key.startsWith(KEY_PREFIX) && key !== storageKey)
            .forEach((key) => localStorage.removeItem(key));
        saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    } catch {
        // Storage unavailable or unreadable: progress just lasts until the page reloads.
    }
    setDone(new Set(saved));
}

export function completeDemoTask(id: DemoTaskId) {
    if (done.has(id)) return;
    const next = new Set(done).add(id);
    setDone(next);
    try {
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
        // Storage unavailable: progress just lasts until the page reloads.
    }
}

export function useDemoTasksDone(): ReadonlySet<DemoTaskId> {
    return useSyncExternalStore((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, () => done);
}

type BookingBody = Partial<Record<keyof ReservationResponse, unknown>>;

function bookingBody(data: unknown): BookingBody {
    try {
        return typeof data === "string" ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}

/**
 * The booking as this browser last saw it, whichever page loaded it (form, calendar, cancelled list): the newest copy.
 * Still what it was before this save, because the pages refresh their data after the answer arrives.
 */
function lastSeenBooking(queryClient: QueryClient, id: string): ReservationResponse | undefined {
    const newestFirst = queryClient.getQueryCache().findAll({queryKey: ["reservations"]})
        .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    for (const query of newestFirst) {
        const data = query.state.data as ReservationResponse | ReservationResponse[] | { items?: ReservationResponse[] } | undefined;
        const bookings = Array.isArray(data) ? data : data && "items" in data ? data.items ?? [] : data ? [data as ReservationResponse] : [];
        const found = bookings.find((booking) => booking.id === id);
        if (found) return found;
    }
    return undefined;
}

const amount = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));

function tickFromSave(body: BookingBody, before: ReservationResponse) {
    const datesChanged = body.checkIn !== before.checkIn || body.checkOut !== before.checkOut;
    const guestsChanged = amount(body.guestsCount) !== before.guestsCount;
    const priceChanged = (["pricePerGuest", "nightlyRate", "totalAmount"] as const)
        .some((field) => amount(body[field]) !== amount(before[field]));
    if (datesChanged) completeDemoTask("dates");
    if (guestsChanged) completeDemoTask("guests");
    // The form recalculates the amounts when dates or guests change: that alone isn't changing the price
    if (priceChanged && !datesChanged && !guestsChanged) completeDemoTask("price");
    if (body.status === "PAID" && before.status !== "PAID") completeDemoTask("paid");
    if (before.status === "CANCELLED" && body.status !== "CANCELLED") completeDemoTask("restore");
}

function tickFromAnswer({config}: AxiosResponse, queryClient: QueryClient) {
    const url = config.url ?? "";
    const oneBookingId = ONE_BOOKING.exec(url)?.[1];
    switch (config.method) {
        case "post":
            if (url === "/api/reservations") {
                completeDemoTask("add");
                if (bookingBody(config.data).status === "PAID") completeDemoTask("paid");
            } else if (/^\/api\/reservations\/[^/]+\/copy$/.test(url)) {
                completeDemoTask("copy");
            } else if (/^\/api\/reservations\/[^/]+\/move$/.test(url)) {
                completeDemoTask("move");
            } else if (/^\/api\/properties\/[^/]+\/units$/.test(url)) {
                completeDemoTask("room");
            }
            break;
        case "put": {
            const before = oneBookingId ? lastSeenBooking(queryClient, oneBookingId) : undefined;
            if (before) tickFromSave(bookingBody(config.data), before);
            break;
        }
        case "delete":
            if (oneBookingId) completeDemoTask("cancel");
            break;
        case "get":
            if (/^\/api\/invoices\/properties\/[^/]+\/export$/.test(url)) completeDemoTask("export");
            break;
    }
}

/** Ticks tasks from the API's answers while a demo is open. Returns how to stop watching. */
export function watchDemoTasks(queryClient: QueryClient): () => void {
    const interceptor = apiClient.interceptors.response.use(
        (response) => {
            tickFromAnswer(response, queryClient);
            return response;
        },
        (error) => {
            if (axios.isAxiosError<{ code?: string }>(error) && error.response?.data?.code === "DATES_TAKEN") {
                completeDemoTask("doubleBook");
            }
            return Promise.reject(error);
        },
    );
    return () => apiClient.interceptors.response.eject(interceptor);
}
