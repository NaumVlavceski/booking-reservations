import type {Page} from "@playwright/test";
import {test, expect, allowApiError} from "./support/fixtures.ts";
import {apiOk, createProperty, createReservation, createVerifiedOwner, day} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";
import {logOut} from "./support/ui.ts";

const offlineErrors = (guard: {allowFailedRequest(r: RegExp): void; allowConsole(r: RegExp): void}) => {
    guard.allowFailedRequest(/ERR_INTERNET_DISCONNECTED|ERR_NETWORK|Could not connect|internet connection|offline|ERR_FAILED/i);
    guard.allowConsole(/ERR_INTERNET_DISCONNECTED|Network Error|Failed to load resource|\[RoomTrack\]/);
};

test.describe("offline", () => {
    test("calendar stays readable offline from the saved copy, and nothing can be added", async ({page, context, signedIn, guard}) => {
        offlineErrors(guard);
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => localStorage.getItem("roomtrack.offlineCalendar") !== null)).toBe(true);
        await context.setOffline(true);
        await expect(page.getByText(/Offline — view only/)).toBeVisible();
        await expect(page.getByRole("button", {name: "Sync calendars"})).toBeDisabled();
        // A tap on the grid only explains
        const sc = page.getByRole("region", {name: "Booking calendar"});
        const box = (await sc.boundingBox())!;
        // Far in the future (no bookings there), in the first room row
        await sc.evaluate((el) => el.scrollBy({left: 6000}));
        const room = (await sc.locator('a[href*="/units/"]').first().boundingBox())!;
        await page.mouse.click(box.x + box.width - 30, room.y + room.height / 2);
        await expect(page.getByText(/You're offline\. Connect to/).first()).toBeVisible();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        // A booking opens read-only: Save is off
        await page.getByRole("button", {name: "Today"}).click();
        await page.getByRole("link", {name: / · Due /}).first().click();
        await expect(page.getByText("You're offline. Connect to save.")).toBeVisible();
        await expect(page.getByRole("button", {name: "Save"})).toBeDisabled();
        await context.setOffline(false);
        await expect(page.getByRole("button", {name: "Save"})).toBeEnabled();
    });

    test("another page offline shows the offline screen; back online it recovers", async ({page, context, signedIn, guard}) => {
        offlineErrors(guard);
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await expect(page.getByRole("heading", {name: "Calendar"})).toBeVisible();
        await context.setOffline(true);
        await page.getByRole("button", {name: "More actions"}).click();
        await page.getByRole("menuitem", {name: "Cancelled bookings"}).click();
        await expect(page.getByText(/offline/i).first()).toBeVisible();
        await context.setOffline(false);
        await expect(page.getByRole("heading", {name: "Cancelled bookings"})).toBeVisible({timeout: 15_000});
    });
});

test.describe("server trouble", () => {
    test("API 500 on the calendar: an error with Retry, which recovers", async ({page, signedIn, guard}) => {
        allowApiError(guard, 500);
        guard.allowFailedRequest(/\/api\/reservations/);
        await signedIn("a");
        let fail = true;
        await page.route("**/api/reservations", (route) => fail
            ? route.fulfill({status: 500, contentType: "application/json", body: JSON.stringify({code: "INTERNAL"})})
            : route.continue());
        await page.goto("/dashboard/calendar");
        await expect(page.getByText("Couldn't load your calendar")).toBeVisible({timeout: 15_000});
        fail = false;
        await page.getByRole("button", {name: /Try again|Retry/}).click();
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible();
    });

    test("API unreachable (connection refused): the calendar falls back to its saved copy", async ({page, signedIn, guard}) => {
        offlineErrors(guard);
        guard.allowFailedRequest(/\/api\//);
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => localStorage.getItem("roomtrack.offlineCalendar") !== null)).toBe(true);
        await page.route("**/api/**", (route) => route.abort("connectionrefused"));
        await page.getByRole("button", {name: "Sync calendars"}).click();
        await expect(page.getByText(/Can't reach RoomTrack|Offline/).first()).toBeVisible();
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible();
    });

    test("slow network: skeleton first, then the calendar", async ({page, signedIn}) => {
        await signedIn("a");
        await page.route("**/api/reservations", async (route) => {
            await new Promise((r) => setTimeout(r, 2500));
            await route.continue();
        });
        await page.goto("/dashboard/calendar");
        await expect(page.getByText(/Loading/).first().or(page.locator("[aria-busy=true]").first())).toBeVisible();
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible({timeout: 15_000});
    });

    test("a request slower than 20 s times out with a clear message", async ({page, signedIn, guard}) => {
        test.slow();
        allowApiError(guard, 0);
        guard.allowConsole(/timeout|ECONNABORTED|\[RoomTrack\]/i);
        guard.allowFailedRequest(/\/api\/properties/);
        await signedIn("a");
        await page.route("**/api/properties", () => { /* never answers */ });
        await page.goto("/dashboard/properties");
        await expect(page.getByText(/taking longer than usual/)).toBeVisible({timeout: 50_000});
    });
});

test.describe("navigation", () => {
    const routes = (s = seed()) => [
        "/dashboard/calendar", "/dashboard/properties", `/dashboard/properties/${s.a.properties.lake.id}`,
        `/dashboard/properties/${s.a.properties.lake.id}/edit`, `/dashboard/properties/${s.a.properties.lake.id}/units/new`,
        `/dashboard/properties/${s.a.properties.lake.id}/units/${s.a.units.lake1.id}`,
        `/dashboard/reservations/new?unitId=${s.a.units.lake1.id}&checkIn=${day(20)}`,
        `/dashboard/reservations/${s.a.reservations[0].id}`, "/dashboard/cancelled", "/dashboard/invoices",
        `/dashboard/invoices/properties/${s.a.properties.lake.id}`, `/dashboard/invoices/units/${s.a.units.lake1.id}`,
        `/dashboard/invoices/properties/${s.a.properties.lake.id}/missing-amounts`, "/dashboard/conflicts",
        "/dashboard/sync-health", "/dashboard/help/connect-calendars", "/dashboard/account", "/dashboard/account/password",
        "/dashboard/properties/new",
    ];

    test("refresh on every route keeps the page (deep links work)", async ({page, signedIn}) => {
        test.slow();
        await signedIn("a");
        for (const path of routes()) {
            await page.goto(path);
            await expect(page.getByRole("heading", {level: 1}).first()).not.toHaveText("");
            await page.waitForLoadState("networkidle");
            const before = await page.getByRole("heading", {level: 1}).first().textContent();
            await page.reload();
            await expect(page.getByRole("heading", {level: 1}).first()).toHaveText(before!);
            expect(new URL(page.url()).pathname).toBe(path.split("?")[0]);
        }
    });

    test("back and forward through the app", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "More actions"}).click();
        await page.getByRole("menuitem", {name: "Properties", exact: true}).click();
        await expect(page.getByRole("heading", {name: "Properties", level: 1})).toBeVisible();
        await page.getByRole("link", {name: /Lakeside Apartments/}).first().click();
        await expect(page.getByRole("heading", {name: "Lakeside Apartments"})).toBeVisible();
        await page.goBack();
        await expect(page.getByRole("heading", {name: "Properties", level: 1})).toBeVisible();
        await page.goBack();
        await expect(page.getByRole("heading", {name: "Calendar"})).toBeVisible();
        await page.goForward();
        await expect(page.getByRole("heading", {name: "Properties", level: 1})).toBeVisible();
    });

    test("rapid clicking: Today ×20, menu ×10, Sync ×5 → one sync request", async ({page, signedIn}) => {
        await signedIn("a");
        let syncs = 0;
        await page.route("**/api/calendars/sync-all", async (route) => {
            syncs++;
            await new Promise((r) => setTimeout(r, 500));
            await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({triggered: 0, skipped: 0, total: 0})});
        });
        await page.goto("/dashboard/calendar");
        const today = page.getByRole("button", {name: "Today"});
        for (let i = 0; i < 20; i++) await today.click({delay: 0});
        const more = page.getByRole("button", {name: "More actions"});
        for (let i = 0; i < 10; i++) await more.click({delay: 0});
        await expect(page.getByRole("menu")).toBeHidden();
        const sync = page.getByRole("button", {name: "Sync calendars"});
        await sync.click();
        for (let i = 0; i < 4; i++) await page.getByRole("button", {name: /Sync(ing)? calendars/}).click({force: true, delay: 0}).catch(() => {});
        await expect(page.getByText("Calendar is up to date. No Booking.com calendars are connected yet.").first()).toBeVisible();
        expect(syncs).toBe(1);
    });
});

test.describe("two tabs", () => {
    test("a booking added in one tab shows in the other after a reload", async ({page, context, signedIn}) => {
        const owner = await createVerifiedOwner();
        const {units} = await createProperty(owner.token, "Two Tabs", 1);
        await signedIn(owner);
        await page.goto("/dashboard/calendar");
        const tab2 = await context.newPage();
        await tab2.goto("/dashboard/calendar");
        await createReservation(owner.token, {unitId: units[0].id, checkIn: day(1), checkOut: day(3), guestName: "From Tab One"});
        await tab2.reload();
        await expect(tab2.getByRole("link", {name: /^From Tab One · /})).toBeVisible();
    });

    test("logging out in one tab: the other tab goes to login on its next step", async ({page, context, signedIn, guard}) => {
        allowApiError(guard, 401);
        test.fail(true, "FE-15: after a log-out in another tab, requests go out without a token; the 401 is not treated as a session end (client.ts:61 needs sentToken), so the tab shows load errors instead of the login page");
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Two Tabs Out", 1);
        await signedIn(owner);
        await page.goto("/dashboard/calendar");
        const tab2 = await context.newPage();
        await tab2.goto("/dashboard/calendar");
        await expect(tab2.getByRole("heading", {name: "Calendar"})).toBeVisible();
        await logOut(page);
        await expect(page).toHaveURL(/\/login$/);
        await tab2.getByRole("button", {name: "More actions"}).click();
        await tab2.getByRole("menuitem", {name: "Cancelled bookings"}).click();
        await expect(tab2).toHaveURL(/\/login$/, {timeout: 5000});
    });
});

async function xssFired(page: Page) {
    return page.evaluate(() => (window as unknown as {__xss?: unknown}).__xss ?? null);
}

test.describe("security in the browser", () => {
    const PAYLOADS = [
        `<img src=x onerror="window.__xss='img'">`,
        `<script>window.__xss='script'</script>`,
        `"><svg onload="window.__xss='svg'">`,
        `javascript:window.__xss='href'`,
    ];

    test("names with HTML/script are shown as text everywhere and never run", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner({fullName: PAYLOADS[0]});
        const {property, units} = await createProperty(owner.token, PAYLOADS[1], 2, PAYLOADS[2]);
        await apiOk("PUT", `/api/units/${units[0].id}`, owner.token, {name: PAYLOADS[2], capacity: 2});
        const r = await createReservation(owner.token, {unitId: units[0].id, checkIn: day(1), checkOut: day(4), guestName: PAYLOADS[0], notes: PAYLOADS[1], guestPhone: PAYLOADS[3], totalAmount: 10});
        const c = await createReservation(owner.token, {unitId: units[1].id, checkIn: day(1), checkOut: day(4), guestName: PAYLOADS[3]});
        await apiOk("DELETE", `/api/reservations/${c.id}`, owner.token);
        await signedIn(owner);
        for (const path of ["/dashboard/calendar", "/dashboard/properties", `/dashboard/properties/${property.id}`,
            `/dashboard/properties/${property.id}/units/${units[0].id}`, `/dashboard/reservations/${r.id}`, "/dashboard/cancelled",
            `/dashboard/invoices/properties/${property.id}?dates=all`, `/dashboard/invoices/units/${units[0].id}?dates=all`, "/dashboard/account"]) {
            await page.goto(path);
            await expect(page.getByRole("heading", {level: 1}).first()).toBeVisible();
            await page.waitForLoadState("networkidle");
            expect(await xssFired(page), path).toBeNull();
            expect(await page.locator("main img[src=x], main svg[onload], main script").count(), path).toBe(0);
        }
        await page.goto("/dashboard/properties");
        await expect(page.getByText(PAYLOADS[1]).first()).toBeVisible();
        // Room links/bars built from data never get a javascript: href
        await page.goto("/dashboard/calendar");
        const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
        expect(hrefs.filter((h) => /^javascript:/i.test(h))).toEqual([]);
    });

    test("cross-tenant: owner B cannot open owner A's booking, property, room or invoices", async ({page, signedIn, guard}) => {
        allowApiError(guard, 404);
        guard.allowConsole(/\[RoomTrack\]/);
        await signedIn("b");
        const s = seed();
        const aRes = s.a.reservations.find((r) => r.guestName && !s.a.cancelledIds.includes(r.id))!;
        const leaks = [aRes.guestName, "Lakeside Apartments", "Lake Studio", "Kej Makedonija"];
        const visits = [
            `/dashboard/reservations/${aRes.id}`,
            `/dashboard/properties/${s.a.properties.lake.id}`,
            `/dashboard/properties/${s.a.properties.lake.id}/edit`,
            `/dashboard/properties/${s.a.properties.lake.id}/units/${s.a.units.lake1.id}`,
            `/dashboard/invoices/properties/${s.a.properties.lake.id}?dates=all`,
            `/dashboard/invoices/units/${s.a.units.lake1.id}?dates=all`,
            `/dashboard/reservations/new?unitId=${s.a.units.lake1.id}&checkIn=${day(30)}`,
        ];
        for (const path of visits) {
            await page.goto(path);
            await page.waitForLoadState("networkidle");
            const text = await page.locator("main").innerText();
            for (const leak of leaks) expect(text, `${path} shows ${leak}`).not.toContain(leak);
        }
        // Saving a booking into A's room is refused
        await page.goto(`/dashboard/reservations/new?unitId=${s.a.units.lake1.id}&checkIn=${day(30)}`);
        const {pickStay} = await import("./support/ui.ts");
        await pickStay(page, null, day(31));
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByRole("alert").first()).toBeVisible();
        const aCount = (await apiOk<unknown[]>("GET", "/api/reservations", await (await import("./support/fixtures.ts")).tokenFor("a"))).length;
        expect(aCount).toBe(s.a.reservations.length - s.a.cancelledIds.length);
    });

    test("the token lives in localStorage (readable by any script on the origin)", async ({page, signedIn}) => {
        // Documented, not a test failure: no HttpOnly cookie; any XSS would read it. CSP is the main mitigation (none today).
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toMatch(/^ey/);
    });
});
