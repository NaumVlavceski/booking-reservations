import type {Page} from "@playwright/test";
import {test, expect, allowApiError} from "./support/fixtures.ts";
import {apiOk, createProperty, createReservation, createVerifiedOwner, day, listReservations, psql} from "./support/backend.ts";
import {pickStay} from "./support/ui.ts";

// Every test here gets its own owner (one property, three rooms), so tests can run in parallel and change data.
async function freshOwner(rooms = 3) {
    const owner = await createVerifiedOwner();
    const {property, units} = await createProperty(owner.token, "Res House", rooms);
    return {...owner, property, units};
}

interface Full {
    id: string; unitId: string; checkIn: string; checkOut: string; status: string; guestName: string; guestEmail: string | null;
    guestPhone: string | null; notes: string | null; guestsCount: number; totalAmount: number | null; nightlyRate: number | null;
    pricePerGuest: number | null; source: string;
}

const priceInputs = (page: Page) => ({
    total: page.getByLabel("Total", {exact: true}),
    night: page.getByLabel("Per night", {exact: true}),
    guest: page.getByLabel("Per guest", {exact: true}),
});

async function openNew(page: Page, unitId: string, checkIn: string) {
    await page.goto(`/dashboard/reservations/new?unitId=${unitId}&checkIn=${checkIn}`);
    await expect(page.getByRole("heading", {name: /^Reservation /})).toBeVisible();
}

test.describe("create a booking", () => {
    test("all fields, total → per night and per guest, saved exactly once", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(30));
        await expect(page.getByRole("button", {name: /^Check-in/})).not.toContainText("Add date");
        const p = priceInputs(page);
        await expect(p.total).toBeDisabled();
        await expect(p.total).toHaveAttribute("placeholder", "Pick dates");
        await pickStay(page, null, day(33));
        await expect(page.getByText("3 nights")).toBeVisible();
        await p.total.fill("100");
        await expect(p.night).toHaveValue("33.33");
        await expect(p.guest).toHaveValue("16.67");
        await page.locator("label").filter({has: page.getByRole("radio", {name: "Paid"})}).click();
        await page.getByLabel("Guest name").fill("Ана Петрова 🏖️");
        await page.getByLabel("Phone").fill("+389 70 555 666");
        await page.getByLabel("Email", {exact: true}).fill("ana@example.test");
        await page.getByLabel("Notes").fill("Arrives late, needs a crib");
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Booking added to the calendar.")).toBeVisible();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        const list = await apiOk<Full[]>("GET", `/api/reservations?unitId=${o.units[0].id}`, o.token);
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
            checkIn: day(30), checkOut: day(33), status: "PAID", guestName: "Ана Петрова 🏖️", guestPhone: "+389 70 555 666",
            guestEmail: "ana@example.test", notes: "Arrives late, needs a crib", guestsCount: 2, totalAmount: 100,
            nightlyRate: 33.33, pricePerGuest: 16.67, source: "DIRECT",
        });
        await expect(page.getByRole("link", {name: /^Ана Петрова 🏖️ · /})).toBeVisible();
    });

    test("per night → total and per guest", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(40));
        await pickStay(page, null, day(43));
        const p = priceInputs(page);
        await p.night.fill("45.5");
        await expect(p.total).toHaveValue("136.5");
        await expect(p.guest).toHaveValue("22.75");
    });

    test("per guest → per night and total; more guests keep per guest and raise the total (owner decision)", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(40));
        await pickStay(page, null, day(43));
        const p = priceInputs(page);
        await p.guest.fill("20");
        await expect(p.night).toHaveValue("40");
        await expect(p.total).toHaveValue("120");
        await page.getByRole("button", {name: "Increase guests"}).click();
        await expect(p.guest).toHaveValue("20");
        await expect(p.night).toHaveValue("60");
        await expect(p.total).toHaveValue("180");
        await expect(page.getByText("Total price was recalculated based on your changes.")).toBeVisible();
        // Down to one guest; the minus button stops at 1
        await page.getByRole("button", {name: "Decrease guests"}).click();
        await page.getByRole("button", {name: "Decrease guests"}).click();
        await expect(page.getByRole("button", {name: "Decrease guests"})).toBeDisabled();
        await expect(p.total).toHaveValue("60");
    });

    test("editing another price after one was computed, then changing the dates", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(40));
        await pickStay(page, null, day(43));
        const p = priceInputs(page);
        await p.total.fill("100");
        await expect(p.night).toHaveValue("33.33");
        await p.night.fill("50");
        await expect(p.total).toHaveValue("150");
        await expect(p.guest).toHaveValue("25");
        // 5 nights now: the nightly rate stays, the total follows
        await pickStay(page, null, day(45));
        await expect(p.night).toHaveValue("50");
        await expect(p.total).toHaveValue("250");
        // Same number of nights, other days: nothing changes
        await pickStay(page, day(41), day(46));
        await expect(p.total).toHaveValue("250");
    });

    test("only a total, then longer dates: the total stays and the nightly rate follows", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(40));
        await pickStay(page, null, day(43));
        const p = priceInputs(page);
        await p.total.fill("300");
        await expect(p.night).toHaveValue("100");
        // Clear per night and per guest so only the total is set
        await p.night.fill("");
        await p.guest.fill("");
        await p.total.fill("300");
        await pickStay(page, null, day(46));
        await expect(p.total).toHaveValue("300");
        await expect(p.night).toHaveValue("50");
    });

    test("validation: no dates, negative price, bad email, notes over 255", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(50));
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Pick a check-in and a check-out date.")).toBeVisible();
        await pickStay(page, null, day(52));
        await expect(page.getByText("Pick a check-in and a check-out date.")).toBeHidden();
        const p = priceInputs(page);
        // Since the FE-03 fix the price fields only take plain amounts: a minus sign is not accepted at all
        await p.total.fill("-5");
        await expect(p.total).toHaveValue("");
        await page.getByLabel("Email", {exact: true}).fill("not-an-email");
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Enter an email address like name@example.com, or leave it empty.")).toBeVisible();
        await p.total.fill("10");
        await page.getByLabel("Email", {exact: true}).fill("");
        await page.getByLabel("Notes").fill("x".repeat(256));
        await expect(page.getByText("256 of 255 characters")).toBeVisible();
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Notes can be up to 255 characters. This has 256.")).toBeVisible();
        await expect(page.getByLabel("Notes")).toBeFocused();
        expect(await listReservations(o.token)).toHaveLength(0);
    });

    test("a comma decimal ('45,50') is not silently turned into another amount", async ({page, signedIn}) => {
        // FE-03 (High), fixed in Phase 8: the price fields are text fields that read a comma as the decimal point.
        // Before the fix, Chromium (en-US) saved 4550 here.
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(50));
        await pickStay(page, null, day(52));
        const p = priceInputs(page);
        await p.total.click();
        await page.keyboard.type("45,50");
        await page.getByRole("button", {name: "Save"}).click();
        // Either the browser accepted the comma (locale) and saved 45.5, or the form says what to type.
        const saved = page.getByText("Booking added to the calendar.");
        const message = page.getByText("Enter a number, e.g. 45 or 45.50.");
        await expect(saved.or(message).first()).toBeVisible();
        if (await saved.isVisible()) {
            const [r] = await apiOk<Full[]>("GET", "/api/reservations", o.token);
            test.info().annotations.push({type: "comma", description: `saved totalAmount=${r.totalAmount}`});
            expect(r.totalAmount, "45,50 must mean 45.50 (or be refused)").toBe(45.5);
        }
    });

    test("double-clicking Save creates one booking", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        // Hold the create request for a moment so a second click would land while it is pending
        await page.route("**/api/reservations", async (route) => {
            if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 800));
            await route.continue();
        });
        await openNew(page, o.units[1].id, day(60));
        await pickStay(page, null, day(62));
        await page.getByLabel("Guest name").fill("Double Click");
        await page.getByRole("button", {name: "Save"}).dblclick();
        await expect(page.getByText("Booking added to the calendar.")).toBeVisible();
        expect(await listReservations(o.token)).toHaveLength(1);
    });

    test("pressing Enter twice in a field creates one booking", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await page.route("**/api/reservations", async (route) => {
            if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 800));
            await route.continue();
        });
        await openNew(page, o.units[1].id, day(64));
        await pickStay(page, null, day(66));
        const name = page.getByLabel("Guest name");
        await name.fill("Enter Twice");
        await name.press("Enter");
        await name.press("Enter").catch(() => {});
        await expect(page.getByText("Booking added to the calendar.")).toBeVisible();
        expect(await listReservations(o.token)).toHaveLength(1);
    });

    test("Back with unsaved changes asks first; Cancel stays, Exit leaves without saving", async ({page, signedIn}) => {
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(1), checkOut: day(3), guestName: "Original Name"});
        await signedIn(o);
        // Reach the form inside the app (as a user does), so the browser's back stays in the app
        await page.goto("/dashboard/calendar");
        await page.getByRole("link", {name: /^Original Name · /}).click();
        await expect(page.getByLabel("Guest name")).toHaveValue("Original Name");
        await page.getByLabel("Guest name").fill("Not Saved");
        await page.getByRole("link", {name: "Back"}).click();
        const dialog = page.getByRole("alertdialog", {name: "Changes will not be saved"});
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", {name: "Cancel"}).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByLabel("Guest name")).toHaveValue("Not Saved");
        // The browser's back is blocked too
        await page.goBack();
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(new RegExp(`/reservations/${r.id}$`));
        await page.getByRole("link", {name: "Back"}).click();
        await dialog.getByRole("button", {name: "Exit"}).click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        expect((await listReservations(o.token))[0].guestName).toBe("Original Name");
    });

    test("refreshing with unsaved changes keeps them as a draft until Save", async ({page, signedIn}) => {
        // FE-11, solved the owner's way (2026-11-13): no "leave page?" warning; a refresh keeps what was typed
        // (this tab only) and says so. Before, a reload dropped the changes silently.
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(70), checkOut: day(72), guestName: "Original Name"});
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await expect(page.getByLabel("Guest name")).toHaveValue("Original Name");
        await page.getByLabel("Guest name").fill("Changed Before Refresh");
        await page.getByLabel("Notes").fill("typed, not saved");
        await page.reload();
        await expect(page.getByText("We kept what you typed. Check it and press Save.")).toBeVisible();
        await expect(page.getByLabel("Guest name")).toHaveValue("Changed Before Refresh");
        await expect(page.getByLabel("Notes")).toHaveValue("typed, not saved");
        // Nothing reached the server yet
        expect((await listReservations(o.token))[0].guestName).toBe("Original Name");
        await page.getByRole("button", {name: "Save"}).click();
        await expect.poll(async () => (await listReservations(o.token))[0].guestName).toBe("Changed Before Refresh");
        // A saved form leaves nothing behind: the next refresh shows the saved booking without the note
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.reload();
        await expect(page.getByLabel("Guest name")).toHaveValue("Changed Before Refresh");
        await expect(page.getByText("We kept what you typed. Check it and press Save.")).toHaveCount(0);
    });

    test("a clean form leaves on Back without asking", async ({page, signedIn}) => {
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(70));
        await page.getByRole("link", {name: "Back"}).click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    });

    test("dates taken meanwhile: the save is refused with the room and dates (409)", async ({page, signedIn, guard}) => {
        allowApiError(guard, 409);
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(80));
        await pickStay(page, null, day(83));
        // Someone else books the same nights in another tab
        await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(81), checkOut: day(82), guestName: "Other Tab"});
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByRole("alert").filter({hasText: /already booked/})).toContainText("Room 1");
        expect(await listReservations(o.token)).toHaveLength(1);
    });

    test("booked nights are disabled in the picker; leaving on another guest's arrival day is allowed", async ({page, signedIn}) => {
        const o = await freshOwner();
        await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(90), checkOut: day(93), guestName: "Booked"});
        await signedIn(o);
        await openNew(page, o.units[0].id, day(87));
        await page.getByRole("button", {name: /^Check-out/}).click();
        const { dayButton } = await import("./support/ui.ts");
        await expect(await dayButton(page, day(91))).toBeDisabled();
        await expect(await dayButton(page, day(90))).toBeEnabled();
        await (await dayButton(page, day(90))).click();
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Booking added to the calendar.")).toBeVisible();
    });

    test("a price above what the database holds gets a clear message about the price", async ({page, signedIn, guard}) => {
        test.fail(true, "FE-10: total 1,000,000,000 overflows numeric(10,2); the API answers 409 CONFLICT 'This request conflicts with existing data.' and the form shows that instead of a price message (no max on the inputs, no @DecimalMax/@Digits on the DTO)");
        allowApiError(guard, 400);
        allowApiError(guard, 409);
        const o = await freshOwner();
        await signedIn(o);
        await openNew(page, o.units[0].id, day(100));
        await pickStay(page, null, day(101));
        await priceInputs(page).total.fill("1000000000");
        const response = page.waitForResponse((r) => r.url().endsWith("/api/reservations") && r.request().method() === "POST");
        await page.getByRole("button", {name: "Save"}).click();
        const res = await response;
        test.info().annotations.push({type: "overflow", description: `POST total=1e9 → ${res.status()}`});
        expect(res.status()).toBeLessThan(500);
        await expect(page.getByRole("alert").first()).toBeVisible();
        // What it should say: something about the amount, not "conflicts with existing data"
        await expect(page.getByRole("alert").first()).toContainText(/price|amount|total|too (large|high)/i, {timeout: 2000});
    });

    test("a new booking without ?unitId goes back to the calendar (as the PWA 'New reservation' shortcut does)", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/reservations/new");
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    });
});

test.describe("edit, move, copy, cancel", () => {
    test("edit a booking and save", async ({page, signedIn}) => {
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Edit Me", totalAmount: 300, nightlyRate: 100, pricePerGuest: 50});
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await expect(page.getByLabel("Guest name")).toHaveValue("Edit Me");
        await expect(priceInputs(page).total).toHaveValue("300");
        // Opening an existing booking does not show the "recalculated" notice
        await expect(page.getByText("Total price was recalculated based on your changes.")).toBeHidden();
        await page.getByLabel("Guest name").fill("Edited Name");
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Booking saved.")).toBeVisible();
        const saved = await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token);
        expect(saved.guestName).toBe("Edited Name");
        expect(saved.totalAmount).toBe(300);
    });

    test("Move to a free room", async ({page, signedIn}) => {
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Mover"});
        await createReservation(o.token, {unitId: o.units[2].id, checkIn: day(6), checkOut: day(7), guestName: "Blocks Room 3"});
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.getByRole("button", {name: "Booking actions"}).click();
        await page.getByRole("menuitem", {name: "Move"}).click();
        const dialog = page.getByRole("dialog", {name: "Move booking"});
        await expect(dialog.getByRole("radio", {name: "Room 2"})).toBeVisible();
        // Room 3 is taken on those nights, so it is not offered
        await expect(dialog.getByRole("radio", {name: "Room 3"})).toHaveCount(0);
        await expect(dialog.getByRole("button", {name: "Move", exact: true})).toBeDisabled();
        await dialog.getByRole("radio", {name: "Room 2"}).click();
        await dialog.getByRole("button", {name: "Move", exact: true}).click();
        await expect(page.getByText("Booking moved to Room 2.")).toBeVisible();
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).unitId).toBe(o.units[1].id);
    });

    test("Move refused by the server (409) shows the reason in the dialog", async ({page, signedIn, guard}) => {
        allowApiError(guard, 409);
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Refused"});
        await signedIn(o);
        await page.route(`**/api/reservations/${r.id}/move`, (route) => route.fulfill({
            status: 409, contentType: "application/json",
            body: JSON.stringify({code: "DATES_TAKEN", message: "taken", room: "Room 2", takenFrom: day(5), takenTo: day(8)}),
        }));
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.getByRole("button", {name: "Booking actions"}).click();
        await page.getByRole("menuitem", {name: "Move"}).click();
        const dialog = page.getByRole("dialog", {name: "Move booking"});
        await dialog.getByRole("radio", {name: "Room 2"}).click();
        await dialog.getByRole("button", {name: "Move", exact: true}).click();
        await expect(dialog.getByRole("alert")).toContainText("Room 2 is already booked");
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).unitId).toBe(o.units[0].id);
    });

    test("Move when no other room is free", async ({page, signedIn}) => {
        const o = await freshOwner(2);
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Stuck"});
        await createReservation(o.token, {unitId: o.units[1].id, checkIn: day(5), checkOut: day(8), guestName: "Full"});
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.getByRole("button", {name: "Booking actions"}).click();
        await page.getByRole("menuitem", {name: "Move"}).click();
        await expect(page.getByText("No other room in this property is free on these dates.")).toBeVisible();
    });

    test("Copy to two rooms (without prices)", async ({page, signedIn}) => {
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Group", totalAmount: 300, nightlyRate: 100, pricePerGuest: 50});
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.getByRole("button", {name: "Booking actions"}).click();
        await page.getByRole("menuitem", {name: "Copy"}).click();
        const dialog = page.getByRole("dialog", {name: "Copy booking"});
        await dialog.getByRole("checkbox", {name: "Room 2"}).click();
        await dialog.getByRole("checkbox", {name: "Room 3"}).click();
        await dialog.getByRole("button", {name: "Copy to 2 rooms"}).click();
        await expect(page.getByText("Booking copied to Room 2, Room 3.")).toBeVisible();
        const all = await apiOk<Full[]>("GET", "/api/reservations", o.token);
        expect(all).toHaveLength(3);
        expect(all.filter((x) => x.id !== r.id).every((x) => x.totalAmount === null && x.guestName === "Group")).toBe(true);
    });

    test("Move with unsaved changes offers to save them first", async ({page, signedIn}) => {
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Before"});
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.getByLabel("Guest name").fill("After");
        await page.getByRole("button", {name: "Booking actions"}).click();
        await page.getByRole("menuitem", {name: "Move"}).click();
        const dialog = page.getByRole("dialog", {name: "Move booking"});
        await dialog.getByRole("radio", {name: "Room 2"}).click();
        await expect(dialog.getByRole("button", {name: "Move", exact: true})).toBeDisabled();
        await dialog.getByRole("button", {name: "Save changes"}).click();
        await expect(page.getByText("Changes saved.")).toBeVisible();
        // Saving clears the room choice (MoveReservationDialog.tsx:51), so it is picked again
        await dialog.getByRole("radio", {name: "Room 2"}).click();
        await expect(dialog.getByRole("button", {name: "Move", exact: true})).toBeEnabled();
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).guestName).toBe("After");
    });

    test("Cancel: Escape keeps it; confirm cancels; Undo restores", async ({page, signedIn}) => {
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Cancel Me", status: "PAID"});
        await signedIn(o);
        await page.goto("/dashboard/calendar");
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.getByRole("button", {name: "Booking actions"}).click();
        await page.getByRole("menuitem", {name: "Cancel"}).click();
        const dialog = page.getByRole("alertdialog", {name: "Cancel Cancel Me?"});
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("button", {name: "Keep booking"})).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).status).toBe("PAID");
        await page.getByRole("button", {name: "Booking actions"}).click();
        await page.getByRole("menuitem", {name: "Cancel"}).click();
        await dialog.getByRole("button", {name: "Cancel booking"}).click();
        await expect(page.getByText("Booking cancelled. The dates are free again.")).toBeVisible();
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).status).toBe("CANCELLED");
        await page.getByRole("button", {name: "Undo"}).click();
        await expect(page.getByText("Booking restored.")).toBeVisible();
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).status).toBe("PAID");
    });

    test("a Booking.com booking: no Move; Cancel only explains where to cancel it (one green OK, nothing sent)", async ({page, signedIn}) => {
        // Owner's decision (2026-11-13): for any booking that is not Direct, Cancel shows this message and OK only.
        // (The API still refuses with 409 CHANNEL_BOOKING while the feed lists it: IcalSyncE2eAuditTest.)
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "CLOSED - Not available"});
        psql(`UPDATE reservation SET source = 'BOOKING' WHERE id = '${r.id}'`);
        let deleteSent = false;
        await page.route(`**/api/reservations/${r.id}`, (route) => {
            if (route.request().method() === "DELETE") deleteSent = true;
            return route.continue();
        });
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await page.getByRole("button", {name: "Booking actions"}).click();
        // Owner's decision: a booking from a channel cannot be moved (Copy and Cancel stay)
        await expect(page.getByRole("menuitem", {name: "Copy"})).toBeVisible();
        await expect(page.getByRole("menuitem", {name: "Move"})).toHaveCount(0);
        await page.getByRole("menuitem", {name: "Cancel"}).click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog.getByText("This booking is still on Booking.com. Cancel it on Booking.com: RoomTrack takes it off the calendar by itself at the next syncs.")).toBeVisible();
        await expect(dialog.getByRole("button")).toHaveCount(1);
        await expect(dialog.getByRole("button", {name: "OK"})).toBeFocused();
        await expect(dialog.getByRole("button", {name: "OK"})).toHaveClass(/btn-success/); // green
        await dialog.getByRole("button", {name: "OK"}).click();
        await expect(dialog).toBeHidden();
        expect(deleteSent, "Cancel must not call the API for a Booking.com booking").toBe(false);
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).status).toBe("CONFIRMED");
    });

    test("a cancelled booking opens read-only with no Save until a status is picked", async ({page, signedIn}) => {
        const o = await freshOwner();
        const r = await createReservation(o.token, {unitId: o.units[0].id, checkIn: day(5), checkOut: day(8), guestName: "Was Cancelled"});
        await apiOk("DELETE", `/api/reservations/${r.id}`, o.token);
        await signedIn(o);
        await page.goto(`/dashboard/reservations/${r.id}`);
        await expect(page.getByText("This booking is cancelled.", {exact: false})).toBeVisible();
        await expect(page.getByRole("button", {name: "Save"})).toBeHidden();
        await expect(page.getByRole("button", {name: "Booking actions"})).toBeHidden();
        await page.locator("label").filter({has: page.getByRole("radio", {name: "Confirm"})}).click();
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Booking saved.")).toBeVisible();
        expect((await apiOk<Full>("GET", `/api/reservations/${r.id}`, o.token)).status).toBe("CONFIRMED");
    });
});
