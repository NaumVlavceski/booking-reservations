import type {Page} from "@playwright/test";
import {test, expect, allowApiError} from "./support/fixtures.ts";
import {createProperty, createReservation, createVerifiedOwner, day} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";

// Booking.com is never contacted: every request that would make the backend fetch a feed is answered by page.route.

const json = (body: unknown, status = 200) => ({status, contentType: "application/json", body: JSON.stringify(body)});

function failingCalendar(unitId: string, unitName: string) {
    return {
        id: "11111111-1111-4111-8111-111111111111", unitId, unitName, platform: "BOOKING",
        lastSyncedAt: new Date(Date.now() - 3600_000).toISOString(), lastSuccessAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        lastError: "HTTP 404", consecutiveFailures: 4,
    };
}

async function stubHealth(page: Page, calendars: unknown[]) {
    await page.route("**/api/calendars/health", (route) => route.fulfill(json(calendars)));
}

test.describe("sync button", () => {
    test("no calendars connected: says so", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "Sync calendars"}).click();
        await expect(page.getByText("Calendar is up to date. No Booking.com calendars are connected yet.")).toBeVisible();
        await expect(page.getByRole("button", {name: "Sync calendars"})).toBeEnabled();
    });

    test("while syncing the button is renamed and disabled; a failing calendar offers 'See why'", async ({page, signedIn}) => {
        await signedIn("a");
        const unit = seed().a.units.lake1;
        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        await page.route("**/api/calendars/sync-all", async (route) => {
            await held;
            await route.fulfill(json({triggered: 1, skipped: 0, total: 1}));
        });
        await page.goto("/dashboard/calendar");
        await stubHealth(page, [failingCalendar(unit.id, unit.name)]);
        await page.getByRole("button", {name: "Sync calendars"}).click();
        const busy = page.getByRole("button", {name: "Syncing calendars"});
        await expect(busy).toBeDisabled();
        release();
        const toast = page.getByText("1 calendar isn't syncing.");
        await expect(toast).toBeVisible();
        await page.getByRole("button", {name: "See why"}).click();
        await expect(page).toHaveURL(/\/dashboard\/sync-health$/);
        await expect(page.getByText("Booking.com says this calendar link no longer exists.")).toBeVisible();
    });

    test("all synced", async ({page, signedIn}) => {
        await signedIn("a");
        await page.route("**/api/calendars/sync-all", (route) => route.fulfill(json({triggered: 2, skipped: 0, total: 2})));
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "Sync calendars"}).click();
        await expect(page.getByText("Synced 2 calendars. Everything is up to date.")).toBeVisible();
    });

    test("synced less than a minute ago", async ({page, signedIn}) => {
        await signedIn("a");
        await page.route("**/api/calendars/sync-all", (route) => route.fulfill(json({triggered: 0, skipped: 1, total: 1})));
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "Sync calendars"}).click();
        await expect(page.getByText("Calendar is up to date — channels were synced less than a minute ago.")).toBeVisible();
    });

    test("server error: an error toast, the button works again", async ({page, signedIn, guard}) => {
        allowApiError(guard, 500);
        guard.allowFailedRequest(/sync-all/);
        await signedIn("a");
        await page.route("**/api/calendars/sync-all", (route) => route.fulfill(json({code: "INTERNAL", message: "boom"}, 500)));
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "Sync calendars"}).click();
        await expect(page.getByText(/^Couldn't sync with Booking\.com\./)).toBeVisible();
        await expect(page.getByRole("button", {name: "Sync calendars"})).toBeEnabled();
    });
});

test.describe("channels pages", () => {
    test("empty states: no conflicts, all channels syncing", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/conflicts");
        await expect(page.getByRole("navigation", {name: "Channels"})).toBeVisible();
        await expect(page.getByText("No conflicts")).toBeVisible();
        await page.getByRole("navigation", {name: "Channels"}).getByRole("link", {name: "Sync status"}).click();
        await expect(page).toHaveURL(/\/dashboard\/sync-health$/);
        await expect(page.getByText("All channels are syncing")).toBeVisible();
    });

    test("a conflict: open the booking, or keep mine (confirm, go back, keep)", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        const {units} = await createProperty(owner.token, "Conflict House", 1);
        const r = await createReservation(owner.token, {unitId: units[0].id, checkIn: day(10), checkOut: day(13), guestName: "Mine First"});
        await signedIn(owner);
        let dismissed = false;
        await page.route("**/api/conflicts", (route) => route.fulfill(json(dismissed ? [] : [{
            id: "22222222-2222-4222-8222-222222222222", unitId: units[0].id, unitName: units[0].name, platform: "BOOKING",
            incomingStart: day(11), incomingEnd: day(14), incomingSummary: "CLOSED - Not available",
            conflictingReservationId: r.id, kind: "NEW_OVERLAP", createdAt: new Date().toISOString(),
        }])));
        await page.route("**/api/conflicts/*/dismiss", (route) => {
            dismissed = true;
            return route.fulfill({status: 204});
        });
        // The alert chip in the shell (hidden on the conflicts page itself) leads there
        await page.goto("/dashboard/calendar");
        await page.getByRole("link", {name: /1 conflict/}).first().click();
        await expect(page).toHaveURL(/\/dashboard\/conflicts$/);
        await expect(page.getByText("Booking.com says")).toBeVisible();
        await page.getByRole("link", {name: "Change Mine First’s booking"}).click();
        await expect(page).toHaveURL(new RegExp(`/reservations/${r.id}$`));
        await page.goBack();
        await page.getByRole("button", {name: "Keep my booking"}).click();
        const dialog = page.getByRole("alertdialog", {name: "Keep your booking?"});
        await dialog.getByRole("button", {name: "Go back"}).click();
        await expect(dialog).toBeHidden();
        await page.getByRole("button", {name: "Keep my booking"}).click();
        await dialog.getByRole("button", {name: "Keep my booking"}).click();
        await expect(page.getByText("Warning dismissed. Your booking stays as it is.")).toBeVisible();
        await expect(page.getByText("No conflicts")).toBeVisible();
    });

    test("sync status: a failing calendar, Try again recovers it; 'Change the calendar link' opens the room", async ({page, signedIn}) => {
        await signedIn("a");
        const unit = seed().a.units.town2;
        let fixed = false;
        await page.route("**/api/calendars/health", (route) => route.fulfill(json(fixed ? [] : [failingCalendar(unit.id, unit.name)])));
        await page.route("**/api/calendars/*/sync", (route) => {
            fixed = true;
            return route.fulfill(json({...failingCalendar(unit.id, unit.name), lastError: null, consecutiveFailures: 0, lastSuccessAt: new Date().toISOString()}));
        });
        await page.goto("/dashboard/calendar");
        await page.getByRole("link", {name: /1 sync problem/}).first().click();
        await expect(page).toHaveURL(/\/dashboard\/sync-health$/);
        await expect(page.getByText(/failed 4 times in a row/)).toBeVisible();
        await page.getByRole("button", {name: "Try again"}).click();
        await expect(page.getByText("Town Suite is syncing with Booking.com again.")).toBeVisible();
        await expect(page.getByText("All channels are syncing")).toBeVisible();
    });

    test("sync status: 'Change the calendar link' opens the room form", async ({page, signedIn}) => {
        await signedIn("a");
        const unit = seed().a.units.town1;
        await stubHealth(page, [failingCalendar(unit.id, unit.name)]);
        await page.goto("/dashboard/sync-health");
        await page.getByRole("link", {name: /Change the calendar link/}).click();
        await expect(page).toHaveURL(new RegExp(`/units/${unit.id}$`));
    });

    test("no Channels entries in the menus: conflicts and sync problems surface by themselves", async ({page, signedIn}, testInfo) => {
        // FE-12 closed by the owner's decision (2026-11-13): no permanent Channels entry (desktop sidebar or phone tab
        // bar); when there is a problem the alert strip links to it (see the alert tests above).
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        if ((testInfo.project.use.viewport?.width ?? 0) >= 1024) {
            const sidebar = page.getByRole("complementary", {name: "Main menu"});
            await expect(sidebar.getByRole("link", {name: "Calendar"})).toBeVisible();
            await expect(sidebar.getByRole("link", {name: /^(Channels|Booking conflicts|Sync status)/})).toHaveCount(0);
        } else {
            await expect(page.getByRole("link", {name: "Calendar"}).last()).toBeVisible();
            await expect(page.getByRole("link", {name: "Channels", exact: true})).toHaveCount(0);
        }
    });
});

test.describe("connect Booking.com on a room", () => {
    async function openRoom(page: Page, signedIn: (w: {email: string; token: string}) => Promise<string>) {
        const owner = await createVerifiedOwner();
        const {property, units} = await createProperty(owner.token, "Channel House", 1);
        await signedIn(owner);
        await page.goto(`/dashboard/properties/${property.id}/units/${units[0].id}`);
        await expect(page.getByLabel("Calendar export link")).toBeVisible();
        return {owner, unit: units[0]};
    }

    test("a valid-looking link: notice first, then connected (backend call stubbed)", async ({page, signedIn}) => {
        const posted: string[] = [];
        let connected = false;
        await page.route("**/api/units/*/calendars", async (route) => {
            if (route.request().method() === "POST") {
                posted.push(route.request().postDataJSON().icsUrl);
                connected = true;
                const unitId = route.request().url().split("/units/")[1].split("/")[0];
                return route.fulfill(json({id: "33333333-3333-4333-8333-333333333333", unitId, unitName: "Room 1", platform: "BOOKING",
                    lastSyncedAt: null, lastSuccessAt: null, lastError: null, consecutiveFailures: 0}));
            }
            const unitId = route.request().url().split("/units/")[1].split("/")[0];
            return route.fulfill(json(connected ? [{id: "33333333-3333-4333-8333-333333333333", unitId, unitName: "Room 1", platform: "BOOKING",
                lastSyncedAt: null, lastSuccessAt: null, lastError: null, consecutiveFailures: 0}] : []));
        });
        await openRoom(page, signedIn);
        const input = page.getByLabel("Calendar export link");
        const connect = page.getByRole("button", {name: "Connect", exact: true});
        await input.fill("webcal://admin.booking.com/hotel/hoteladmin/ical.html?t=e2e-fake-token");
        await expect(page.getByText("Booking.com link detected")).toBeVisible();
        await connect.click();
        const notice = page.getByRole("dialog", {name: "Things to know before you start"}).or(page.getByRole("alertdialog", {name: "Things to know before you start"}));
        await expect(notice).toBeVisible();
        await notice.getByRole("button", {name: "I understand"}).click();
        await expect(page.getByText("Booking.com connected. Press Sync now to bring its bookings in.")).toBeVisible();
        expect(posted).toEqual(["https://admin.booking.com/hotel/hoteladmin/ical.html?t=e2e-fake-token"]);
        await expect(page.getByText("Booking.com is connected for this room.")).toBeVisible();
    });

    test("a link from another site cannot be submitted", async ({page, signedIn}) => {
        let posted = 0;
        await page.route("**/api/units/*/calendars", (route) => {
            if (route.request().method() === "POST") posted++;
            return route.continue();
        });
        await openRoom(page, signedIn);
        const input = page.getByLabel("Calendar export link");
        for (const bad of ["https://booking.com.evil.example/x.ics", "https://www.airbnb.com/calendar/ical/1.ics", "not a link"]) {
            await input.fill(bad);
            await expect(page.getByText("Only Booking.com calendar links are supported.")).toBeVisible();
            await expect(page.getByRole("button", {name: "Connect", exact: true})).toBeDisabled();
        }
        expect(posted).toBe(0);
    });

    test("an unreachable link: the server's refusal is shown (stubbed 400)", async ({page, signedIn, guard}) => {
        allowApiError(guard, 400);
        await page.route("**/api/units/*/calendars", (route) => route.request().method() === "POST"
            ? route.fulfill(json({message: "That calendar link could not be reached. Check that you copied the whole link."}, 400))
            : route.continue());
        await openRoom(page, signedIn);
        await page.evaluate(() => {
            // Skip the first-time notice for this account (stored per email)
            for (const k of Object.keys(localStorage)) if (k.startsWith("roomtrack.channelNotice")) localStorage.removeItem(k);
        });
        await page.getByLabel("Calendar export link").fill("https://admin.booking.com/unreachable.ics");
        await page.getByRole("button", {name: "Connect", exact: true}).click();
        const notice = page.getByRole("button", {name: "I understand"});
        if (await notice.isVisible().catch(() => false)) await notice.click();
        await expect(page.getByRole("alert").filter({hasText: "could not be reached"})).toBeVisible();
    });

    test("the outgoing feed link is shown with a Copy button and points at this site", async ({page, signedIn, context}, testInfo) => {
        test.skip(testInfo.project.name.includes("webkit"), "clipboard permissions are Chromium-only");
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const {unit} = await openRoom(page, signedIn);
        const feed = page.getByRole("textbox", {name: "Calendar link"});
        await expect(feed).toHaveValue(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/api/ical/${unit.token}\\.ics$`));
        await page.getByRole("button", {name: "Copy"}).click();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/api/ical/${unit.token}.ics`);
    });
});
