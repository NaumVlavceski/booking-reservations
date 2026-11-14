import type {Page} from "@playwright/test";
import {test, expect} from "./support/fixtures.ts";
import {psql} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";

// Timing budgets measure wall-clock time, so this runs in its own Playwright project ("perf"), after every other
// project and with nothing beside it: run in parallel with other browsers it measured the busy machine, not the app
// (2026-11-14: 1.1 s alone, 5.1 s beside 1 other browser, 9.4 s beside 3). `npm run test:e2e:perf` runs it alone.
const scroller = (page: Page) => page.getByRole("region", {name: "Booking calendar"});

test.describe("calendar performance (1,050 reservations, 30 rooms)", () => {
    test("loads, scrolls and opens a booking within budget", async ({page, signedIn}, testInfo) => {
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

