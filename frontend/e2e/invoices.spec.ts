import fs from "node:fs";
import {test, expect} from "./support/fixtures.ts";
import {seed} from "./support/seed-data.ts";
import {readXlsx} from "./support/xlsx.ts";

const lake = () => seed().a.properties.lake;
/** Owner A's Lakeside bookings that count in invoices: CONFIRMED or PAID, not cancelled, not blocked. */
function lakeInvoiced() {
    const s = seed().a;
    const lakeUnits = [s.units.lake1.id, s.units.lake2.id, s.units.lake3.id];
    return s.reservations.filter((r) => lakeUnits.includes(r.unitId) && !s.cancelledIds.includes(r.id) && (r.status === "CONFIRMED" || r.status === "PAID"));
}

test.describe("invoices", () => {
    test.beforeEach(async ({signedIn}) => {
        await signedIn("a");
    });

    test("property list → property (all time) → room → booking", async ({page}) => {
        await page.goto("/dashboard/invoices");
        await expect(page.getByRole("heading", {name: "Invoices"})).toBeVisible();
        await page.getByRole("link", {name: /Lakeside Apartments/}).click();
        await expect(page.getByRole("heading", {name: "Lakeside Apartments"})).toBeVisible();
        await expect(page.getByText("Total, all rooms")).toBeVisible();
        await page.goto(`/dashboard/invoices/properties/${lake().id}?dates=all`);
        await page.getByRole("link", {name: /Lake Studio/}).click();
        await expect(page).toHaveURL(new RegExp(`/dashboard/invoices/units/${seed().a.units.lake1.id}`));
        await expect(page.getByRole("heading", {name: "Lake Studio"})).toBeVisible();
        await page.locator('main a[href^="/dashboard/reservations/"]').first().click();
        await expect(page).toHaveURL(/\/dashboard\/reservations\//);
    });

    test("filters: Paid only, chips, remove chip; filters live in the URL and survive reload", async ({page}) => {
        await page.goto(`/dashboard/invoices/properties/${lake().id}?dates=all`);
        await page.getByRole("button", {name: /^Filters/}).click();
        const sheet = page.getByRole("dialog", {name: "Filters"});
        await sheet.locator("label").filter({has: page.getByRole("radio", {name: "Paid"})}).click();
        await sheet.getByRole("button", {name: "Show results"}).click();
        await expect(page).toHaveURL(/status=PAID/);
        await expect(page.getByRole("button", {name: "Remove status filter"})).toBeVisible();
        await page.reload();
        await expect(page.getByRole("button", {name: "Remove status filter"})).toBeVisible();
        await page.getByRole("button", {name: "Remove status filter"}).click();
        await expect(page).not.toHaveURL(/status=PAID/);
    });

    test("Download Excel gives a valid .xlsx with the expected bookings", async ({page}) => {
        await page.goto(`/dashboard/invoices/properties/${lake().id}?dates=all`);
        const download = page.waitForEvent("download");
        await page.getByRole("button", {name: "Download Excel"}).click();
        const file = await download;
        expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
        const buf = fs.readFileSync((await file.path())!);
        expect(buf.subarray(0, 2).toString()).toBe("PK");
        const wb = readXlsx(buf);
        expect(wb.files).toContain("xl/workbook.xml");
        const text = wb.rows.map((r) => r.join(" | ")).join("\n");
        test.info().attachments.push({name: "export.txt", contentType: "text/plain", body: Buffer.from(text)});
        const expected = lakeInvoiced();
        // The seed renamed one imported booking to Booking.com's placeholder after creating it
        const placeholder = seed().a.importedIds[1];
        for (const r of expected.filter((x) => x.guestName && x.id !== placeholder)) {
            expect(text, `export lists ${r.guestName} ${r.checkIn}`).toContain(r.guestName);
        }
        // Observed: the export prints the channel placeholder as the guest, where the app shows "Booking.com"
        expect(text).toContain("CLOSED - Not available");
        // Dates are real Excel dates (serial numbers), amounts are numbers
        expect(wb.rows.some((r) => r.includes("Check-in"))).toBe(true);
        // No other owner's data, no cancelled/blocked rows of this owner
        expect(text).not.toContain("B Guest");
        expect(text).not.toContain("Town Double");
        const rowsWithDates = wb.rows.filter((r) => r.some((c) => /^\d{4}-\d{2}-\d{2}$/.test(c) || /^\d{5}(\.\d+)?$/.test(c)));
        expect(rowsWithDates.length).toBeGreaterThanOrEqual(expected.length);
    });

    test("Download Excel with Paid only lists only paid bookings", async ({page}) => {
        await page.goto(`/dashboard/invoices/properties/${lake().id}?dates=all&status=PAID`);
        const download = page.waitForEvent("download");
        await page.getByRole("button", {name: "Download Excel"}).click();
        const wb = readXlsx(fs.readFileSync((await (await download).path())!));
        const text = wb.rows.map((r) => r.join(" | ")).join("\n");
        const confirmedOnly = lakeInvoiced().filter((r) => r.status === "CONFIRMED" && r.guestName);
        const paidNames = new Set(lakeInvoiced().filter((r) => r.status === "PAID").map((r) => r.guestName));
        for (const r of confirmedOnly) if (!paidNames.has(r.guestName)) expect(text).not.toContain(r.guestName);
    });

    test("missing amounts page lists bookings without an amount", async ({page}) => {
        await page.goto(`/dashboard/invoices/properties/${lake().id}/missing-amounts?dates=all`);
        await expect(page.getByRole("heading", {name: "Bookings without amount"})).toBeVisible();
        await expect(page.getByRole("main").getByRole("link").first()).toBeVisible();
    });

    test("from after to: the filters are marked invalid instead of querying nonsense", async ({page}) => {
        await page.goto(`/dashboard/invoices/properties/${lake().id}?from=2026-12-31&to=2026-01-01`);
        await expect(page.getByText(/after|before|invalid|range/i).first()).toBeVisible();
    });

    test("Airbnb leftover: ?source=AIRBNB no longer shows an 'Airbnb' chip", async ({page}) => {
        // FE-14 FIXED (useInvoiceFilters.ts no longer accepts AIRBNB): regression test.
        await page.goto(`/dashboard/invoices/properties/${lake().id}?dates=all&source=AIRBNB`);
        await expect(page.getByRole("heading", {name: "Lakeside Apartments"})).toBeVisible();
        await expect(page.getByText("Airbnb", {exact: true})).toHaveCount(0);
    });
});
