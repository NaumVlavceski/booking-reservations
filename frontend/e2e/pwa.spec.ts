import {test, expect} from "./support/fixtures.ts";

// Runs only in the "pwa" project (service workers allowed) against the production build in e2e/.dist.

interface Manifest {
    name: string; short_name: string; start_url: string; scope: string; display: string; id: string; theme_color: string;
    background_color: string; lang: string; icons: {src: string; sizes: string; type: string; purpose?: string}[];
    shortcuts?: {name: string; url: string}[];
}

function pngSize(buf: Buffer) {
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
    return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
}

test.describe("security headers (SEC-06)", () => {
    test("pages are served with the CSP, and the inline theme script still runs under it", async ({page}) => {
        const res = await page.goto("/login");
        const csp = res!.headers()["content-security-policy"] ?? "";
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("script-src 'self' 'sha256-");
        expect(res!.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
        expect(res!.headers()["x-content-type-options"]).toBe("nosniff");
        // The theme script is inline: if its hash were wrong the CSP would block it and dark mode would flash light
        await page.evaluate(() => localStorage.setItem("roomtrack.theme", "dark"));
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    });
});

test.describe("PWA", () => {
    test("manifest: required fields and icons (any 192/512 + maskable 512) that really exist at their size", async ({page, request}) => {
        await page.goto("/login");
        const href = await page.locator('link[rel="manifest"]').getAttribute("href");
        expect(href).toBeTruthy();
        const res = await request.get(href!);
        expect(res.ok()).toBe(true);
        const m = (await res.json()) as Manifest;
        expect(m).toMatchObject({name: "RoomTrack", short_name: "RoomTrack", start_url: "/", scope: "/", display: "standalone", id: "/", lang: "en"});
        expect(m.theme_color).toMatch(/^#[0-9A-F]{6}$/i);
        const any = m.icons.filter((i) => (i.purpose ?? "any").includes("any"));
        const maskable = m.icons.filter((i) => i.purpose?.includes("maskable"));
        expect(any.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
        expect(maskable.map((i) => i.sizes)).toContain("512x512");
        for (const icon of m.icons) {
            const r = await request.get(icon.src);
            expect(r.ok(), icon.src).toBe(true);
            const [w, h] = icon.sizes.split("x").map(Number);
            expect(pngSize(await r.body()), icon.src).toEqual({width: w, height: h});
        }
        const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
        expect(apple).toBeTruthy();
        expect((await request.get(apple!)).ok()).toBe(true);
    });

    test("the 'New reservation' shortcut opens a booking form", async ({page, request, signedIn}) => {
        test.fail(true, "FE-19: manifest shortcut url /dashboard/reservations/new has no ?unitId, so ReservationFormPage redirects to the calendar (vite.config.ts:57-61, ReservationFormPage.tsx:299)");
        await signedIn("a");
        const href = await (async () => { await page.goto("/login"); return page.locator('link[rel="manifest"]').getAttribute("href"); })();
        const m = (await (await request.get(href!)).json()) as Manifest;
        const shortcut = m.shortcuts!.find((s) => s.name === "New reservation")!;
        await page.goto(shortcut.url);
        await expect(page).toHaveURL(/\/dashboard\/reservations\/new/);
    });

    test("the service worker registers in the production build and controls the page", async ({page}) => {
        await page.goto("/login");
        const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
        expect(scope).toMatch(/\/$/);
        await page.reload();
        await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    });

    test("offline: the app shell still opens, and the calendar shows its saved copy", async ({page, context, signedIn, guard}) => {
        guard.allowFailedRequest(/./);
        guard.allowConsole(/ERR_INTERNET_DISCONNECTED|Failed to load resource|Network Error|\[RoomTrack\]|FetchEvent|no-response|workbox/i);
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible();
        await page.evaluate(async () => navigator.serviceWorker.ready);
        await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
        await expect.poll(() => page.evaluate(() => localStorage.getItem("roomtrack.offlineCalendar") !== null)).toBe(true);
        await context.setOffline(true);
        await page.reload();
        await expect(page.getByRole("heading", {name: "Calendar"})).toBeVisible();
        await expect(page.getByText(/Offline — view only/)).toBeVisible();
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible();
        // A deep link that was never visited also opens from the precache (navigateFallback)
        await page.goto("/dashboard/properties");
        await expect(page.locator("#root")).not.toBeEmpty();
        await context.setOffline(false);
    });

    test("no /api response is ever stored in Cache Storage", async ({page, signedIn}) => {
        await signedIn("a");
        for (const url of ["/dashboard/calendar", "/dashboard/properties", "/dashboard/cancelled", "/dashboard/invoices", "/dashboard/account"]) {
            await page.goto(url);
            await page.waitForLoadState("networkidle");
        }
        await page.evaluate(async () => navigator.serviceWorker.ready);
        const cached = await page.evaluate(async () => {
            const urls: string[] = [];
            for (const name of await caches.keys()) {
                for (const req of await (await caches.open(name)).keys()) urls.push(`${name} ${req.url}`);
            }
            return urls;
        });
        expect(cached.length).toBeGreaterThan(0); // the precache exists
        expect(cached.filter((u) => /\/api\//.test(u))).toEqual([]);
        // and no help/landing pictures in the precache (globIgnores)
        expect(cached.filter((u) => /\/(help|landing)\//.test(u))).toEqual([]);
    });

    test("/api/ical/* navigations are not answered with the app shell", async ({page, guard}) => {
        guard.allowConsole(/status of 404/);
        await page.goto("/login");
        await page.evaluate(async () => navigator.serviceWorker.ready);
        await page.reload();
        const res = await page.goto("/api/ical/does-not-exist.ics");
        expect(res?.status()).not.toBe(200);
        expect(await page.content()).not.toContain('id="root"');
    });
});
