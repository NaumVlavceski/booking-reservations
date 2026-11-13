import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type {Page, TestInfo} from "@playwright/test";
import {test, expect} from "./support/fixtures.ts";
import {day} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";

// axe-core on every page (WCAG 2.0/2.1/2.2 A and AA rules). Every violation is recorded in e2e/.work/axe/<project>.json
// for the report. A page fails only on serious/critical violations; known ones are marked test.fail with a finding id.

interface Summary {page: string; violations: {id: string; impact: string | null; nodes: number; help: string; sample: string}[]}

async function scan(page: Page, testInfo: TestInfo, label: string): Promise<Summary> {
    const result = await new AxeBuilder({page}).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
    const summary: Summary = {
        page: label,
        violations: result.violations.map((v) => ({
            id: v.id, impact: v.impact ?? null, nodes: v.nodes.length, help: v.help,
            sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ").slice(0, 200),
        })),
    };
    const dir = path.join(import.meta.dirname, ".work", "axe");
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, `${testInfo.project.name}--${label.replace(/[^a-z0-9]+/gi, "_")}.json`), JSON.stringify(summary, null, 1));
    await testInfo.attach(`axe ${label}`, {body: JSON.stringify(summary, null, 2), contentType: "application/json"});
    return summary;
}

const serious = (s: Summary) => s.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

/** Pages with known serious/critical violations (filled in from the first run; see report). */
const KNOWN: Record<string, string> = {
    calendar: "FE-17: label-content-name-mismatch (serious) on booking bars: aria-label \"Guest · dates · Due X\" does not contain the visible \"X Guest\" text in order (CalendarPage.tsx:709-713, 1059)",
};

const pages = () => {
    const s = seed();
    return [
        ["landing", "/", null],
        ["login", "/login", null],
        ["register", "/register", null],
        ["forgot-password", "/forgot-password", null],
        ["contact", "/contact", null],
        ["privacy", "/privacy", null],
        ["terms", "/terms", null],
        ["calendar", "/dashboard/calendar", "a"],
        ["properties", "/dashboard/properties", "a"],
        ["property-detail", `/dashboard/properties/${s.a.properties.lake.id}`, "a"],
        ["property-form", `/dashboard/properties/${s.a.properties.lake.id}/edit`, "a"],
        ["unit-form", `/dashboard/properties/${s.a.properties.lake.id}/units/${s.a.units.lake1.id}`, "a"],
        ["reservation-new", `/dashboard/reservations/new?unitId=${s.a.units.lake1.id}&checkIn=${day(20)}`, "a"],
        ["reservation-edit", `/dashboard/reservations/${s.a.reservations[0].id}`, "a"],
        ["cancelled", "/dashboard/cancelled", "a"],
        ["invoices", "/dashboard/invoices", "a"],
        ["invoice-property", `/dashboard/invoices/properties/${s.a.properties.lake.id}?dates=all`, "a"],
        ["invoice-unit", `/dashboard/invoices/units/${s.a.units.lake1.id}?dates=all`, "a"],
        ["missing-amounts", `/dashboard/invoices/properties/${s.a.properties.lake.id}/missing-amounts?dates=all`, "a"],
        ["conflicts", "/dashboard/conflicts", "a"],
        ["sync-health", "/dashboard/sync-health", "a"],
        ["help", "/dashboard/help/connect-calendars", "a"],
        ["account", "/dashboard/account", "a"],
        ["change-password", "/dashboard/account/password", "a"],
        ["setup", "/dashboard/setup", "zero"],
        ["not-found", "/dashboard/nope", "a"],
    ] as [string, string, "a" | "zero" | null][];
};

test.describe("axe", () => {
    // The list is built from the seed at run time; titles must be static, so one test per index.
    for (let i = 0; i < 26; i++) {
        test(`page #${i}`, async ({page, signedIn}, testInfo) => {
            const entry = pages()[i];
            if (!entry) test.skip();
            const [label, url, who] = entry;
            testInfo.annotations.push({type: "page", description: `${label} ${url}`});
            if (KNOWN[label]) test.fail(true, KNOWN[label]);
            if (who) await signedIn(who);
            await page.goto(url);
            await expect(page.getByRole("heading", {level: 1}).first()).toBeVisible();
            await page.waitForLoadState("networkidle");
            const summary = await scan(page, testInfo, label);
            expect(serious(summary), `${label}: serious/critical axe violations`).toEqual([]);
        });
    }

    test("open dialogs and menus: More sheet / booking menu / date picker / confirm", async ({page, signedIn}, testInfo) => {
        test.fail(true, "FE-18: color-contrast (serious) on the stay date picker’s outside-month day buttons (showOutsideDays, StayDatesPicker.tsx:141)");
        await signedIn("a");
        await page.goto(`/dashboard/reservations/${seed().a.reservations[0].id}`);
        await page.getByRole("button", {name: /^Check-in/}).click();
        const s1 = await scan(page, testInfo, "date-picker-open");
        await page.keyboard.press("Escape");
        await page.getByRole("button", {name: "Done"}).click().catch(() => {});
        await page.getByRole("button", {name: "Booking actions"}).click();
        const s2 = await scan(page, testInfo, "booking-menu-open");
        await page.getByRole("menuitem", {name: "Cancel"}).click();
        const s3 = await scan(page, testInfo, "confirm-dialog-open");
        expect([...serious(s1), ...serious(s2), ...serious(s3)]).toEqual([]);
    });
});

test.describe("keyboard", () => {
    test("login can be completed with the keyboard only, in a sensible order", async ({page}) => {
        await page.goto("/login");
        await expect(page.getByLabel("Email")).toBeFocused(); // autoFocus
        await page.keyboard.type(seed().a.email);
        await page.keyboard.press("Tab");
        await expect(page.getByLabel("Password", {exact: true})).toBeFocused();
        await page.keyboard.type(seed().password);
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    });

    test("skip link jumps to the main content", async ({page, signedIn}, testInfo) => {
        test.skip((testInfo.project.use.viewport?.width ?? 1280) < 1024, "desktop sidebar");
        await signedIn("a");
        await page.goto("/dashboard/properties");
        await expect(page.getByRole("heading", {name: "Properties", level: 1})).toBeVisible();
        const skip = page.getByRole("link", {name: "Skip to content"});
        await skip.focus();
        await expect(skip).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/#main$/);
    });

    test("reservation form: Tab reaches dates, guests, status, prices, guest fields and Save; Escape closes dialogs", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto(`/dashboard/reservations/new?unitId=${seed().a.units.lake1.id}&checkIn=${day(20)}`);
        await expect(page.getByRole("button", {name: /^Check-in/})).toBeVisible();
        await page.getByRole("link", {name: "Back"}).focus();
        const seen = new Set<string>();
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press("Tab");
            const name = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null;
                if (!el) return "";
                const byIds = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)
                    .map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
                const label = el.getAttribute("aria-label") || byIds || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent)
                    || el.closest("label")?.textContent || el.textContent || "";
                return `${el.tagName}:${label.trim().slice(0, 30)}`;
            });
            seen.add(name);
        }
        const order = [...seen];
        const all = order.join("\n");
        for (const expected of [/Check-in/, /Check-out/, /Increase guests/, /Confirm/, /Guest name/, /Notes/, /Save/]) expect(all).toMatch(expected);
        test.info().annotations.push({type: "tab order", description: order.slice(0, 12).join(" → ")});
    });

    test("focus order follows the screen: Save (pinned at the bottom) comes after the fields", async ({page, signedIn}) => {
        test.fail(true, "FE-20: the sticky Save bar is rendered before the form (FormTopBar.tsx:120-136), so Tab goes Back → Save → fields; on screen Save is last");
        await signedIn("a");
        await page.goto(`/dashboard/reservations/new?unitId=${seed().a.units.lake1.id}&checkIn=${day(20)}`);
        await page.getByRole("link", {name: "Back"}).focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", {name: "Save"})).not.toBeFocused();
    });

    test("every icon-only button has an accessible name (calendar, form, shell)", async ({page, signedIn}) => {
        await signedIn("a");
        for (const url of ["/dashboard/calendar", `/dashboard/reservations/${seed().a.reservations[0].id}`, "/dashboard/properties"]) {
            await page.goto(url);
            await expect(page.getByRole("heading", {level: 1}).first()).toBeVisible();
            const unnamed = await page.evaluate(() => [...document.querySelectorAll("button, a[href], [role=button]")]
                .filter((el) => (el as HTMLElement).offsetParent !== null)
                .filter((el) => !(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.textContent?.trim() || el.getAttribute("title")))
                .map((el) => el.outerHTML.slice(0, 120)));
            expect(unnamed, url).toEqual([]);
        }
    });

    test("confirm dialog traps focus and returns it to the trigger", async ({page, signedIn}) => {
        test.fail(true, "FE-16: after Escape/Keep the focus goes to <body>, not back to the Booking actions button (keyboard and screen-reader users lose their place)");
        await signedIn("a");
        await page.goto(`/dashboard/reservations/${seed().a.reservations[0].id}`);
        const trigger = page.getByRole("button", {name: "Booking actions"});
        await trigger.click();
        await page.getByRole("menuitem", {name: "Cancel"}).click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog.getByRole("button", {name: "Keep booking"})).toBeFocused();
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press("Tab");
            expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
        }
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
    });
});
