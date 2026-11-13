import type {Page} from "@playwright/test";
import {test, expect} from "./support/fixtures.ts";
import {day} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";

// Runs in the responsive-* projects (360x640, 768x1024, 1280x800, 1920x1080) and in webkit-mobile (390x844).

async function noHorizontalOverflow(page: Page, label: string) {
    const {scrollWidth, innerWidth, offenders} = await page.evaluate(() => {
        const w = window.innerWidth;
        const offenders = [...document.querySelectorAll("body *")]
            .filter((el) => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.right <= w + 1) return false;
                // Inside a horizontal scroller (the calendar grid) is fine
                for (let p = el.parentElement; p; p = p.parentElement) {
                    const ox = getComputedStyle(p).overflowX;
                    if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return false;
                }
                return true;
            })
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} right=${Math.round(el.getBoundingClientRect().right)}`);
        return {scrollWidth: document.documentElement.scrollWidth, innerWidth: w, offenders};
    });
    expect(scrollWidth, `${label}: page wider than the viewport (${offenders.join(", ")})`).toBeLessThanOrEqual(innerWidth);
}

const PUBLIC: [string, string][] = [
    ["/", "landing"], ["/login", "login"], ["/register", "register"], ["/forgot-password", "forgot"], ["/contact", "contact"],
    ["/privacy", "privacy"], ["/terms", "terms"],
];

test.describe("responsive", () => {
    for (const [path, name] of PUBLIC) {
        test(`public ${name}: no horizontal overflow, main action visible`, async ({page}) => {
            await page.goto(path);
            await expect(page.getByRole("heading", {level: 1}).first()).toBeVisible();
            await noHorizontalOverflow(page, path);
            if (path === "/login") await expect(page.getByRole("button", {name: "Log in"})).toBeInViewport();
            if (path === "/register") {
                await page.getByRole("button", {name: "Create account"}).scrollIntoViewIfNeeded();
                await expect(page.getByRole("button", {name: "Create account"})).toBeInViewport();
            }
        });
    }

    const signedInPages = () => {
        const s = seed();
        return [
            ["/dashboard/calendar", "Calendar"],
            ["/dashboard/properties", "Properties"],
            [`/dashboard/properties/${s.a.properties.lake.id}`, "Lakeside Apartments"],
            [`/dashboard/properties/${s.a.properties.lake.id}/units/${s.a.units.lake1.id}`, null],
            [`/dashboard/reservations/new?unitId=${s.a.units.lake1.id}&checkIn=${day(20)}`, null],
            [`/dashboard/reservations/${s.a.reservations[0].id}`, null],
            ["/dashboard/cancelled", "Cancelled bookings"],
            [`/dashboard/invoices/properties/${s.a.properties.lake.id}?dates=all`, "Lakeside Apartments"],
            [`/dashboard/invoices/units/${s.a.units.lake1.id}?dates=all`, "Lake Studio"],
            ["/dashboard/conflicts", null],
            ["/dashboard/sync-health", null],
            ["/dashboard/help/connect-calendars", null],
            ["/dashboard/account", "Account"],
        ] as [string, string | null][];
    };

    test("signed-in pages: no horizontal overflow, navigation and Save reachable", async ({page, signedIn}, testInfo) => {
        test.slow();
        await signedIn("a");
        const width = testInfo.project.use.viewport?.width ?? 1280;
        for (const [path, heading] of signedInPages()) {
            await page.goto(path);
            await expect(heading ? page.getByRole("heading", {name: heading, level: 1}) : page.getByRole("heading", {level: 1}).first()).toBeVisible();
            await page.waitForLoadState("networkidle");
            await noHorizontalOverflow(page, `${path} @${width}`);
            const isForm = path.startsWith("/dashboard/reservations") || /\/properties\/.+\/units\//.test(path);
            if (isForm) await expect(page.getByRole("button", {name: "Save"}), `${path}: Save`).toBeInViewport();
            else if (width < 640) await expect(page.getByRole("button", {name: "More", exact: true}), `${path}: More tab`).toBeInViewport();
            else if (width < 1024) await expect(page.getByRole("button", {name: "More", exact: true}), `${path}: rail More`).toBeVisible();
            else await expect(page.getByRole("complementary", {name: "Main menu"}).getByRole("button", {name: "Log out"})).toBeVisible();
        }
    });

    test("calendar toolbar buttons are all on screen", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        for (const name of ["Today", "Sync calendars", "Jump to date", "More actions"]) {
            await expect(page.getByRole("button", {name})).toBeInViewport();
        }
        await expect(page.getByRole("region", {name: "Booking calendar"})).toBeInViewport();
    });

    test("long names do not overflow (255-character property, long guest name)", async ({page, signedIn}) => {
        const {createVerifiedOwner, createProperty, createReservation} = await import("./support/backend.ts");
        const owner = await createVerifiedOwner();
        const long = "Apartmani-" + "Ohridskoezero".repeat(18);
        const {property, units} = await createProperty(owner.token, long.slice(0, 255), 1);
        const r = await createReservation(owner.token, {unitId: units[0].id, checkIn: day(1), checkOut: day(2), guestName: "Maximilian-Alexander-Konstantin von Hohenberg-Lichtenstein-Wittelsbach"});
        await signedIn(owner);
        for (const path of ["/dashboard/calendar", "/dashboard/properties", `/dashboard/properties/${property.id}`, `/dashboard/reservations/${r.id}`, "/dashboard/invoices"]) {
            await page.goto(path);
            await expect(page.getByRole("heading", {level: 1}).first()).toBeVisible();
            await page.waitForLoadState("networkidle");
            await noHorizontalOverflow(page, path);
        }
    });
});
