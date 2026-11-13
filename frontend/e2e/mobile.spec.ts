import {test, expect} from "./support/fixtures.ts";
import {createProperty, createVerifiedOwner} from "./support/backend.ts";

// Phone-only behaviour (webkit-mobile = iPhone 13 user agent, 390x844).

test.describe("phone", () => {
    test.skip(({browserName, isMobile}) => !(browserName === "webkit" && isMobile), "phone project only");

    test("the iPhone install tip does not hide the 'Add property' button", async ({page, signedIn}) => {
        // FE-21 FIXED (the floating button moves above any notice card): regression test. Before, the iPhone
        // "Install RoomTrack" tip sat exactly over the 'Add property' button until closed.
        // Show the tip as a first-time iPhone visitor sees it (only on the first load of this test)
        await page.addInitScript(() => {
            if (!sessionStorage.getItem("fe21.loaded")) {
                localStorage.removeItem("roomtrack.iosInstallHint.closed");
                sessionStorage.setItem("fe21.loaded", "1");
            }
        });
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Phone House", 1);
        await signedIn(owner);
        await page.goto("/dashboard/properties");
        await expect(page.getByRole("button", {name: "Close tip"})).toBeVisible();
        await page.getByRole("link", {name: "Add property"}).first().click({trial: true, timeout: 3000});
        // Closing the tip is remembered
        await page.getByRole("button", {name: "Close tip"}).click();
        await page.reload();
        await expect(page.getByRole("link", {name: "Add property"}).first()).toBeVisible();
        await expect(page.getByRole("button", {name: "Close tip"})).toHaveCount(0);
    });

    test("the tab bar: Calendar, Cancelled, More", async ({page, signedIn}) => {
        // Owner's choice (2026-11-13): Cancelled bookings replaced the Channels tab
        await signedIn("a");
        await page.goto("/dashboard/properties");
        const cancelledTab = page.getByRole("link", {name: "Cancelled", exact: true}).last();
        await cancelledTab.click();
        await expect(page).toHaveURL(/\/dashboard\/cancelled$/);
        await expect(cancelledTab).toHaveAttribute("aria-current", "page");
        await expect(page.getByRole("link", {name: "Channels", exact: true})).toHaveCount(0);
        await page.getByRole("link", {name: "Calendar"}).last().click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        await page.getByRole("button", {name: "More", exact: true}).click();
        await expect(page.getByRole("dialog", {name: "More"})).toBeVisible();
    });

    test("a tap (touch) on a booking bar opens it", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        const bar = page.getByRole("region", {name: "Booking calendar"}).locator("a[aria-label*=' · ']").filter({visible: true}).nth(2);
        await bar.scrollIntoViewIfNeeded();
        const href = await bar.getAttribute("href");
        await bar.tap();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
    });
});
