import {beforeEach, describe, expect, it} from "vitest";
import {markSessionExpired, takeReturnTo} from "./session";

// FE-01: after a session ends, logging in again returns to the page that was open, but only to a page of this app.
const store = new Map<string, string>();
beforeEach(() => {
    store.clear();
    (globalThis as unknown as {sessionStorage: Storage}).sessionStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: () => null,
        length: 0,
    };
});

describe("return target after the session expired", () => {
    it("returns to the app page that was open, once", () => {
        markSessionExpired("/dashboard/cancelled?name=An#top");
        expect(takeReturnTo("/dashboard/calendar")).toBe("/dashboard/cancelled?name=An#top");
        expect(takeReturnTo("/dashboard/calendar")).toBe("/dashboard/calendar");
    });

    it("never returns to another site or a page outside the app (no open redirect)", () => {
        for (const bad of ["https://evil.example/dashboard", "//evil.example/dashboard", "/login", "/", "javascript:alert(1)"]) {
            markSessionExpired(bad);
            expect(takeReturnTo("/dashboard/calendar"), bad).toBe("/dashboard/calendar");
        }
        store.set("roomtrack.returnTo", "//evil.example");
        expect(takeReturnTo("/dashboard/calendar")).toBe("/dashboard/calendar");
    });
});
