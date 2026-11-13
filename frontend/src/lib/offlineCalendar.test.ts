import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {QueryClient} from "@tanstack/react-query";

// offlineCalendar.ts touches localStorage, window and navigator; Node has none of them, so small fakes stand in.
class MemoryStorage {
    data = new Map<string, string>();
    failWrites = false;
    getItem(k: string) {
        return this.data.has(k) ? this.data.get(k)! : null;
    }
    setItem(k: string, v: string) {
        if (this.failWrites) throw new Error("QuotaExceededError");
        this.data.set(k, String(v));
    }
    removeItem(k: string) {
        this.data.delete(k);
    }
}

const KEY = "roomtrack.offlineCalendar";
const KEYS = [["me"], ["properties"], ["units"], ["reservations", "calendar"]];
let storage: MemoryStorage;
let listeners: Record<string, (() => void)[]>;

beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    storage = new MemoryStorage();
    listeners = {};
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", {onLine: true});
    vi.stubGlobal("window", {
        addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
        clearTimeout: (id: number) => clearTimeout(id),
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function load() {
    const mod = await import("./offlineCalendar");
    const reach = await import("./apiReachability");
    const client = new QueryClient();
    mod.keepOffline(client, KEYS);
    return {mod, reach, client};
}

const reservation = {id: "r1", guestName: "Ana Petrova", guestEmail: "ana@example.test", guestPhone: "+389", notes: "VIP", totalAmount: 300};

describe("offlineCalendar", () => {
    it("saves the four calendar queries 500 ms after a successful load, and nothing else", async () => {
        const {client} = await load();
        client.setQueryData(["me"], {email: "owner@example.test"});
        client.setQueryData(["reservations", "calendar"], [reservation]);
        client.setQueryData(["invoices"], {secret: true});
        expect(storage.getItem(KEY)).toBeNull();
        vi.advanceTimersByTime(499);
        expect(storage.getItem(KEY)).toBeNull();
        vi.advanceTimersByTime(1);
        const saved = JSON.parse(storage.getItem(KEY)!);
        expect(saved.map((q: {queryKey: unknown}) => q.queryKey)).toEqual([["me"], ["reservations", "calendar"]]);
        expect(JSON.stringify(saved)).not.toContain("secret");
    });

    it("documented: the saved copy is plaintext and holds guest personal data (name, email, phone, notes)", async () => {
        const {client} = await load();
        client.setQueryData(["reservations", "calendar"], [reservation]);
        vi.advanceTimersByTime(500);
        const raw = storage.getItem(KEY)!;
        for (const pii of ["Ana Petrova", "ana@example.test", "+389", "VIP"]) expect(raw).toContain(pii);
    });

    it("restores into an empty cache when the browser goes offline", async () => {
        storage.setItem(KEY, JSON.stringify([{queryKey: ["properties"], data: [{id: "p1"}], updatedAt: 1}]));
        const {client} = await load();
        expect(client.getQueryData(["properties"])).toBeUndefined();
        listeners.offline.forEach((fn) => fn());
        expect(client.getQueryData(["properties"])).toEqual([{id: "p1"}]);
    });

    it("restores at start-up when the app starts offline", async () => {
        storage.setItem(KEY, JSON.stringify([{queryKey: ["me"], data: {email: "x"}, updatedAt: 1}]));
        vi.stubGlobal("navigator", {onLine: false});
        const {client} = await load();
        expect(client.getQueryData(["me"])).toEqual({email: "x"});
    });

    it("never replaces live data with the saved copy", async () => {
        storage.setItem(KEY, JSON.stringify([{queryKey: ["properties"], data: [{id: "old"}], updatedAt: 1}]));
        const {client} = await load();
        client.setQueryData(["properties"], [{id: "live"}]);
        listeners.offline.forEach((fn) => fn());
        expect(client.getQueryData(["properties"])).toEqual([{id: "live"}]);
    });

    it("restores when the API becomes unreachable (network error, no answer)", async () => {
        storage.setItem(KEY, JSON.stringify([{queryKey: ["units"], data: [{id: "u1"}], updatedAt: 1}]));
        const {client, reach} = await load();
        const {AxiosError} = await import("axios");
        reach.reportApiError(new AxiosError("Network Error", "ERR_NETWORK"));
        expect(reach.isApiReachable()).toBe(false);
        expect(client.getQueryData(["units"])).toEqual([{id: "u1"}]);
        reach.reportApiSuccess();
        expect(reach.isApiReachable()).toBe(true);
    });

    it("a timeout does not count as unreachable", async () => {
        const {reach} = await load();
        const {AxiosError} = await import("axios");
        reach.reportApiError(new AxiosError("timeout", "ECONNABORTED"));
        expect(reach.isApiReachable()).toBe(true);
    });

    it("hasOfflineCalendar needs all four queries", async () => {
        const {mod, client} = await load();
        expect(mod.hasOfflineCalendar(client)).toBe(false);
        for (const key of KEYS) client.setQueryData(key, []);
        expect(mod.hasOfflineCalendar(client)).toBe(true);
    });

    it("clearOfflineCalendar removes the copy", async () => {
        const {mod, client} = await load();
        client.setQueryData(["me"], {email: "x"});
        vi.advanceTimersByTime(500);
        expect(storage.getItem(KEY)).not.toBeNull();
        mod.clearOfflineCalendar();
        expect(storage.getItem(KEY)).toBeNull();
    });

    it("full or unavailable storage is ignored, not thrown", async () => {
        const {client} = await load();
        storage.failWrites = true;
        client.setQueryData(["me"], {email: "x"});
        expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    });

    it("a corrupt saved copy is ignored", async () => {
        storage.setItem(KEY, "{not json");
        const {client} = await load();
        expect(() => listeners.offline.forEach((fn) => fn())).not.toThrow();
        expect(client.getQueryData(["me"])).toBeUndefined();
    });

    it("a page that loads only some of the queries keeps the rest of the saved copy", async () => {
        storage.setItem(KEY, JSON.stringify([{queryKey: ["units"], data: [{id: "u1"}], updatedAt: 1}]));
        const {client} = await load();
        client.setQueryData(["me"], {email: "x"});
        vi.advanceTimersByTime(500);
        const keys = JSON.parse(storage.getItem(KEY)!).map((q: {queryKey: unknown}) => JSON.stringify(q.queryKey));
        expect(keys.sort()).toEqual(['["me"]', '["units"]']);
    });
});
