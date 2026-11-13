import {test, expect, allowApiError} from "./support/fixtures.ts";
import {apiOk, createProperty, createReservation, createVerifiedOwner, day, listReservations} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";

test.describe("properties and rooms", () => {
    test("add a property with rooms, edit it, add/edit/delete a room, delete the property with its bookings", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Existing", 1);
        await signedIn(owner);
        await page.goto("/dashboard/properties");
        await page.getByRole("link", {name: "Add property"}).first().click();
        await page.getByLabel("Name", {exact: true}).fill("Villa Ohrid");
        await page.getByLabel("Address").fill("Kej 1, Ohrid");
        await page.getByLabel("Number of rooms").fill("3");
        await page.getByRole("button", {name: "Save"}).click();
        // Saving a new property opens the calendar with its rooms
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        await expect(page.getByRole("button", {name: "Collapse Villa Ohrid"})).toBeVisible();
        const props = await apiOk<{id: string; name: string}[]>("GET", "/api/properties", owner.token);
        const villa = props.find((p) => p.name === "Villa Ohrid")!;
        expect(villa).toBeTruthy();
        expect(await apiOk<unknown[]>("GET", `/api/properties/${villa.id}/units`, owner.token)).toHaveLength(3);

        // Edit
        await page.goto(`/dashboard/properties/${villa.id}/edit`);
        await page.getByLabel("Name", {exact: true}).fill("Villa Ohrid Lake");
        await page.getByRole("button", {name: "Save"}).click();
        await expect.poll(async () => (await apiOk<{name: string}>("GET", `/api/properties/${villa.id}`, owner.token)).name).toBe("Villa Ohrid Lake");

        // Rooms: add, edit, delete
        await page.goto(`/dashboard/properties/${villa.id}`);
        await page.getByRole("link", {name: /Add room|Add your first room/}).first().click();
        await page.getByLabel("Name", {exact: true}).fill("Penthouse");
        await page.getByLabel("Capacity").fill("6");
        await page.getByRole("button", {name: "Save"}).click();
        await expect.poll(async () => (await apiOk<{name: string}[]>("GET", `/api/properties/${villa.id}/units`, owner.token)).map((u) => u.name)).toContain("Penthouse");
        const units = await apiOk<{id: string; name: string}[]>("GET", `/api/properties/${villa.id}/units`, owner.token);
        const room1 = units.find((u) => u.name === "Room 1")!;
        await createReservation(owner.token, {unitId: room1.id, checkIn: day(3), checkOut: day(5), guestName: "Goes With Room"});

        await page.goto(`/dashboard/properties/${villa.id}`);
        await page.getByRole("button", {name: "Actions for Room 1"}).click();
        await page.getByRole("menuitem", {name: "Delete Room 1"}).click();
        const dialog = page.getByRole("alertdialog", {name: "Delete Room 1?"});
        await expect(dialog).toContainText("This also deletes its 1 reservation. This can't be undone.");
        await dialog.getByRole("button", {name: "Delete room"}).click();
        await expect.poll(async () => (await apiOk<{name: string}[]>("GET", `/api/properties/${villa.id}/units`, owner.token)).length).toBe(3);
        expect(await listReservations(owner.token)).toHaveLength(0);

        // Delete the property: the dialog counts rooms and bookings
        const room2 = units.find((u) => u.name === "Room 2")!;
        await createReservation(owner.token, {unitId: room2.id, checkIn: day(3), checkOut: day(5), guestName: "Goes With Property"});
        await page.goto("/dashboard/properties");
        await page.getByRole("button", {name: "Actions for Villa Ohrid Lake"}).click();
        await page.getByRole("menuitem", {name: "Delete Villa Ohrid Lake"}).click();
        const pdialog = page.getByRole("alertdialog", {name: "Delete Villa Ohrid Lake?"});
        await expect(pdialog).toContainText("3 rooms and 1 reservation");
        await pdialog.getByRole("button", {name: "Delete property"}).click();
        await expect(page.getByRole("button", {name: "Actions for Villa Ohrid Lake"})).toHaveCount(0);
        expect((await apiOk<{name: string}[]>("GET", "/api/properties", owner.token)).map((p) => p.name)).toEqual(["Existing"]);
    });

    test("validation: empty name, rooms out of range, capacity out of range", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        const {property} = await createProperty(owner.token, "Valid House", 1);
        await signedIn(owner);
        await page.goto("/dashboard/properties/new");
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.locator(".field-error").first()).toBeVisible();
        await page.getByLabel("Name", {exact: true}).fill("X");
        await page.getByLabel("Number of rooms").fill("201");
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.locator(".field-error").first()).toBeVisible();
        expect(await apiOk<unknown[]>("GET", "/api/properties", owner.token)).toHaveLength(1);
        await page.goto(`/dashboard/properties/${property.id}/units/new`);
        await page.getByLabel("Name", {exact: true}).fill("Big");
        await page.getByLabel("Capacity").fill("0");
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.locator(".field-error").first()).toBeVisible();
    });

    test("long names, Cyrillic, emoji and right-to-left text are kept and shown as text", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        await signedIn(owner);
        const names = ["Вила Охрид — Апартман", "🏖️ Beach House 🌊", "بيت الضيافة", "A".repeat(255)];
        for (const name of names) await createProperty(owner.token, name, 1);
        await page.goto("/dashboard/properties");
        for (const name of names.slice(0, 3)) await expect(page.getByText(name, {exact: true}).first()).toBeVisible();
        // The 255-character name does not push the page sideways
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test("cancelled bookings: search by guest, filter by check-in, restore", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        const {units} = await createProperty(owner.token, "Cancel House", 2);
        const a = await createReservation(owner.token, {unitId: units[0].id, checkIn: day(5), checkOut: day(7), guestName: "Ana Restore"});
        const b = await createReservation(owner.token, {unitId: units[1].id, checkIn: day(30), checkOut: day(32), guestName: "Boris Later"});
        for (const r of [a, b]) await apiOk("DELETE", `/api/reservations/${r.id}`, owner.token);
        await signedIn(owner);
        await page.goto("/dashboard/cancelled");
        await expect(page.getByRole("button", {name: "Restore Ana Restore"})).toBeVisible();
        await expect(page.getByRole("button", {name: "Restore Boris Later"})).toBeVisible();
        await page.getByLabel("Guest name").fill("Bor");
        await expect(page.getByRole("button", {name: "Restore Ana Restore"})).toBeHidden();
        await expect(page.getByRole("button", {name: "Restore Boris Later"})).toBeVisible();
        // LIKE wildcards are literal
        await page.getByLabel("Guest name").fill("%");
        await expect(page.getByText("No cancelled bookings match")).toBeVisible();
        await page.getByRole("button", {name: "Clear filters"}).first().click();
        await page.getByRole("button", {name: "Restore Ana Restore"}).click();
        await expect(page.getByText("Ana Restore is back on the calendar.")).toBeVisible();
        expect((await apiOk<{status: string}>("GET", `/api/reservations/${a.id}`, owner.token)).status).toBe("CONFIRMED");
    });

    test("restoring onto dates taken since is refused with a message", async ({page, signedIn, guard}) => {
        allowApiError(guard, 409);
        const owner = await createVerifiedOwner();
        const {units} = await createProperty(owner.token, "Taken House", 1);
        const a = await createReservation(owner.token, {unitId: units[0].id, checkIn: day(5), checkOut: day(7), guestName: "Old Guest"});
        await apiOk("DELETE", `/api/reservations/${a.id}`, owner.token);
        await createReservation(owner.token, {unitId: units[0].id, checkIn: day(6), checkOut: day(8), guestName: "New Guest"});
        await signedIn(owner);
        await page.goto("/dashboard/cancelled");
        await page.getByRole("button", {name: "Restore Old Guest"}).click();
        await expect(page.getByText(/Can.t restore: some of those nights have been booked since/)).toBeVisible();
        expect((await apiOk<{status: string}>("GET", `/api/reservations/${a.id}`, owner.token)).status).toBe("CANCELLED");
    });

    test("owner A's seeded cancelled bookings are listed", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/cancelled");
        const cancelled = seed().a.reservations.filter((r) => seed().a.cancelledIds.includes(r.id) && r.guestName);
        for (const r of cancelled) await expect(page.getByRole("button", {name: `Restore ${r.guestName}`})).toBeVisible();
    });
});
