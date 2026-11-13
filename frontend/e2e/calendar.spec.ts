import type {Page} from "@playwright/test";
import {test, expect} from "./support/fixtures.ts";
import {createProperty, createVerifiedOwner, day, psql} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";
import {longDate} from "./support/ui.ts";

/** Room links in the room column are named "<room> <capacity>". */
const roomName = (name: string) => new RegExp(`^${name} \\d+$`);
const scroller = (page: Page) => page.getByRole("region", {name: "Booking calendar"});

/** Centre of the calendar cell for a room (by its name in the room column) and a day offset from today. */
async function cellPoint(page: Page, room: string, offset: number) {
    const sc = scroller(page);
    const today = sc.locator(".cal-day-header", {has: page.locator(".cal-day-num.is-today")});
    const roomLink = sc.getByRole("link", {name: roomName(room)});
    await expect(today).toBeAttached();
    let t = (await today.boundingBox())!;
    const box = (await sc.boundingBox())!;
    // Bring the target day into view if it is off to the right
    const targetX = t.x + offset * t.width + t.width / 2;
    if (targetX > box.x + box.width - t.width) {
        await sc.evaluate((el, dx) => el.scrollBy({left: dx}), targetX - (box.x + box.width / 2));
        await expect.poll(async () => (await today.boundingBox())?.x).not.toBe(t.x);
        t = (await today.boundingBox())!;
    }
    const r = (await roomLink.boundingBox())!;
    return {x: t.x + offset * t.width + t.width / 2, y: r.y + r.height / 2};
}

test.describe("calendar (owner A)", () => {
    test.beforeEach(async ({signedIn}) => {
        await signedIn("a");
    });

    test("shows both properties, all five rooms and the bookings around today", async ({page}) => {
        await page.goto("/dashboard/calendar");
        await expect(page.getByRole("heading", {name: "Calendar"})).toBeVisible();
        await expect(scroller(page).getByText("Rooms (5)")).toBeVisible();
        for (const name of ["Lake Studio", "Lake Family Room", "Lake Attic", "Town Double", "Town Suite"]) {
            await expect(scroller(page).getByRole("link", {name: roomName(name)})).toBeVisible();
        }
        // A stay that started yesterday is on screen (bars are links named "Guest · dates · amount")
        const current = seed().a.reservations.find((r) => r.checkIn === day(-1) && r.status !== "CANCELLED" && r.guestName);
        expect(current).toBeTruthy();
        await expect(page.getByRole("link", {name: new RegExp(`^${current!.guestName} · `)}).first()).toBeVisible();
    });

    test("bar names say guest, dates and what is due; paid, blocked and missing amounts read differently", async ({page}) => {
        await page.goto("/dashboard/calendar");
        const bars = scroller(page).locator("a[aria-label*=' · ']");
        await expect(bars.first()).toBeVisible();
        const labels = await bars.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
        expect(labels.some((l) => / · Due /.test(l))).toBe(true);
        expect(labels.some((l) => / · Paid$/.test(l))).toBe(true);
        expect(labels.some((l) => /^Blocked · /.test(l))).toBe(true);
        expect(labels.some((l) => / · No amount recorded$/.test(l))).toBe(true);
        expect(labels.some((l) => /dates changed, check the price/.test(l))).toBe(true);
        // Imported placeholder name is replaced by the channel name
        expect(labels.some((l) => /^Booking\.com · /.test(l))).toBe(true);
        // Cancelled bookings are not on the calendar
        const cancelledNames = seed().a.reservations.filter((r) => seed().a.cancelledIds.includes(r.id)).map((r) => r.id);
        for (const id of cancelledNames) await expect(scroller(page).locator(`a[href="/dashboard/reservations/${id}"]`)).toHaveCount(0);
    });

    test("a bar opens its booking", async ({page}) => {
        await page.goto("/dashboard/calendar");
        const bar = scroller(page).locator("a[aria-label*=' · Due ']").first();
        const href = await bar.getAttribute("href");
        await bar.click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
        await expect(page.getByRole("button", {name: /^Check-in/})).toBeVisible();
    });

    test("tapping an empty day in a room's row starts a booking for that room and day", async ({page}) => {
        await page.goto("/dashboard/calendar");
        const p = await cellPoint(page, "Lake Studio", 17);
        await page.mouse.click(p.x, p.y);
        await expect(page).toHaveURL(new RegExp(`/dashboard/reservations/new\\?unitId=${seed().a.units.lake1.id}&checkIn=${day(17)}$`));
        await expect(page.getByRole("button", {name: new RegExp(`^Check-in`)})).toContainText(String(Number(day(17).slice(8))));
    });

    test("Today brings the view back after scrolling away", async ({page}) => {
        await page.goto("/dashboard/calendar");
        const sc = scroller(page);
        await expect(sc.locator(".cal-day-num.is-today")).toBeVisible();
        const start = await sc.evaluate((el) => el.scrollLeft);
        await sc.evaluate((el) => el.scrollBy({left: 3000}));
        await expect.poll(() => sc.evaluate((el) => el.scrollLeft)).toBeGreaterThan(start + 1000);
        await expect(sc.locator(".cal-day-num.is-today")).not.toBeInViewport();
        await page.getByRole("button", {name: "Today"}).click();
        await expect(sc.locator(".cal-day-num.is-today")).toBeInViewport();
    });

    test("dragging with the mouse pans the calendar and does not open a bar", async ({page}) => {
        await page.goto("/dashboard/calendar");
        const sc = scroller(page);
        // A bar that is fully on screen (the rendered window extends off both edges)
        const box = (await sc.boundingBox())!;
        const bars = sc.locator("a[aria-label*=' · ']");
        await expect(bars.first()).toBeAttached();
        let b: {x: number; y: number; width: number; height: number} | null = null;
        for (const bar of await bars.all()) {
            const bb = await bar.boundingBox();
            if (bb && bb.width > 30 && bb.x + bb.width / 2 > box.x + 160 && bb.x + bb.width / 2 < box.x + box.width - 60) {
                b = bb;
                break;
            }
        }
        expect(b, "a bar fully in view").not.toBeNull();
        const before = await sc.evaluate((el) => el.scrollLeft);
        const y = b!.y + b!.height / 2;
        const x0 = b!.x + b!.width / 2;
        await page.mouse.move(x0, y);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) await page.mouse.move(x0 - i * 20, y);
        await page.mouse.up();
        await expect.poll(() => sc.evaluate((el, b) => Math.abs(el.scrollLeft - b), before)).toBeGreaterThan(20);
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    });

    test("Jump to date moves to the picked month", async ({page}) => {
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "Jump to date"}).click();
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth() + 2, 15);
        const next = page.getByRole("button", {name: /next month/i});
        await next.click();
        await next.click();
        await page.getByRole("grid").locator("button", {hasText: /^15$/}).first().click();
        await expect(page.locator(".cal-month-label")).toHaveText(
            `${target.toLocaleString("en-US", {month: "long"})} ${target.getFullYear()}`);
    });

    test("More actions menu: Properties, Cancelled bookings, expand/collapse; Escape closes it", async ({page}) => {
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "More actions"}).click();
        const menu = page.getByRole("menu");
        await expect(menu.getByRole("menuitem", {name: "Properties", exact: true})).toBeVisible();
        await expect(menu.getByRole("menuitem", {name: "Cancelled bookings"})).toBeVisible();
        await expect(menu.getByRole("menuitem", {name: /Collapse all properties/})).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await page.getByRole("button", {name: "More actions"}).click();
        await menu.getByRole("menuitem", {name: "Cancelled bookings"}).click();
        await expect(page).toHaveURL(/\/dashboard\/cancelled$/);
    });

    test("collapsing a property hides its rooms and is remembered after reload", async ({page}) => {
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "Collapse Old Town House"}).click();
        await expect(scroller(page).getByRole("link", {name: roomName("Town Suite")})).toBeHidden();
        await page.reload();
        await expect(page.getByRole("button", {name: "Expand Old Town House"})).toBeVisible();
        await expect(scroller(page).getByRole("link", {name: roomName("Town Suite")})).toBeHidden();
        await page.getByRole("button", {name: "Expand Old Town House"}).click();
        await expect(scroller(page).getByRole("link", {name: roomName("Town Suite")})).toBeVisible();
    });

    test("a room name opens the room's settings", async ({page}) => {
        await page.goto("/dashboard/calendar");
        await scroller(page).getByRole("link", {name: roomName("Lake Attic")}).click();
        await expect(page).toHaveURL(new RegExp(`/units/${seed().a.units.lake3.id}$`));
        await expect(page.getByLabel("Name", {exact: true})).toHaveValue("Lake Attic");
    });

    test("a11y: a day cell can be reached and activated from the keyboard to add a booking", async ({page}) => {
        test.fail(true, "FE-02: day cells are plain divs with no role, name or tabindex; creating a booking needs a pointer (CalendarPage.tsx:509-537, 748-765)");
        await page.goto("/dashboard/calendar");
        const cell = scroller(page).getByRole("button", {name: new RegExp(longDate(day(3)))})
            .or(scroller(page).getByRole("gridcell", {name: new RegExp(longDate(day(3)))}));
        await expect(cell.first()).toBeVisible({timeout: 2000});
    });
});

test.describe("calendar edge owners", () => {
    test("an owner with no properties is sent to set-up", async ({page, signedIn}) => {
        await signedIn("zero");
        await page.goto("/dashboard/calendar");
        await expect(page).toHaveURL(/\/dashboard\/setup$/);
        await expect(page.getByRole("heading", {name: "Add your property"})).toBeVisible();
    });

    test("a property with no rooms shows 'Add a room'", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Empty House", 0);
        await signedIn(owner);
        await page.goto("/dashboard/calendar");
        await expect(page.getByText("No rooms yet — add one to see it on the calendar.")).toBeVisible();
        await page.getByRole("link", {name: "Add a room"}).click();
        await expect(page).toHaveURL(/\/units\/new$/);
    });

    test("rooms but no bookings shows the first-booking hint", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Fresh House", 2);
        await signedIn(owner);
        await page.goto("/dashboard/calendar");
        await expect(page.getByText(/a day in a room's row to add your first booking\./)).toBeVisible();
    });
});

test.describe("calendar performance (1,050 reservations, 30 rooms)", () => {
    test("loads, scrolls and opens a booking within budget", async ({page, signedIn}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium", "timing is measured once, on desktop Chromium");
        await signedIn("perf");
        const count = Number(psql(`SELECT count(*) FROM reservation r JOIN app_user u ON u.owner_id = r.owner_id WHERE u.email = '${seed().perf.email}';`));
        expect(count).toBeGreaterThanOrEqual(1000);
        const t0 = Date.now();
        await page.goto("/dashboard/calendar");
        await expect(scroller(page).getByText("Rooms (30)")).toBeVisible();
        await expect(scroller(page).locator("a[aria-label^='Perf guest']").first()).toBeVisible();
        const loadMs = Date.now() - t0;

        // Scroll a year to the left and back, a frame at a time, and count long tasks
        await page.evaluate(() => {
            (window as unknown as {__long: number}).__long = 0;
            new PerformanceObserver((list) => {
                (window as unknown as {__long: number}).__long += list.getEntries().filter((e) => e.duration > 50).length;
            }).observe({type: "longtask", buffered: false});
        });
        const scrollMs = await scroller(page).evaluate(async (el) => {
            const start = performance.now();
            for (let i = 0; i < 60; i++) {
                el.scrollLeft -= 200;
                await new Promise((r) => requestAnimationFrame(() => r(null)));
            }
            for (let i = 0; i < 60; i++) {
                el.scrollLeft += 200;
                await new Promise((r) => requestAnimationFrame(() => r(null)));
            }
            return performance.now() - start;
        });
        const longTasks = await page.evaluate(() => (window as unknown as {__long: number}).__long);
        const domNodes = await page.evaluate(() => document.querySelectorAll("*").length);
        const heapMb = await page.evaluate(() => Math.round(((performance as unknown as {memory?: {usedJSHeapSize: number}}).memory?.usedJSHeapSize ?? 0) / 1e6));
        testInfo.annotations.push({type: "perf", description: JSON.stringify({reservations: count, loadMs, scroll120FramesMs: Math.round(scrollMs), longTasks, domNodes, heapMb})});
        console.log("perf", {reservations: count, loadMs, scroll120FramesMs: Math.round(scrollMs), longTasks, domNodes, heapMb});
        expect(loadMs).toBeLessThan(5000);
        expect(scrollMs).toBeLessThan(120 * 50); // under 50 ms a frame on average

        const t1 = Date.now();
        await scroller(page).locator("a[aria-label^='Perf guest']").first().click();
        await expect(page.getByRole("button", {name: /^Check-in/})).toBeVisible();
        testInfo.annotations.push({type: "perf", description: `open booking ${Date.now() - t1} ms`});
    });
});

