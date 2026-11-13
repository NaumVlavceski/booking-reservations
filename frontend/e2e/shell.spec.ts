import type {Page} from "@playwright/test";
import {test, expect, allowApiError} from "./support/fixtures.ts";
import {api, createProperty, createVerifiedOwner, login} from "./support/backend.ts";

/** Opens a nav destination: the sidebar on desktop, the More sheet (or the rail) on smaller screens. */
async function more(page: Page) {
    const sidebar = page.getByRole("complementary", {name: "Main menu"});
    if (await sidebar.isVisible().catch(() => false)) return sidebar;
    await page.getByRole("button", {name: "More", exact: true}).click();
    const sheet = page.getByRole("dialog", {name: "More"});
    await expect(sheet).toBeVisible();
    return sheet;
}

test.describe("More menu / sidebar", () => {
    test("every destination opens its page", async ({page, signedIn}) => {
        await signedIn("a");
        for (const [name, url] of [
            ["Properties", /\/dashboard\/properties$/],
            ["Cancelled bookings", /\/dashboard\/cancelled$/],
            ["Invoices", /\/dashboard\/invoices/],
            ["Account and privacy", /\/dashboard\/account$/],
        ] as const) {
            await page.goto("/dashboard/calendar");
            const sidebar = page.getByRole("complementary", {name: "Main menu"});
            if (name === "Cancelled bookings" && !(await sidebar.isVisible().catch(() => false))) {
                // Phones and tablets: a tab of its own since 2026-11-13 (owner's choice), no longer in More
                await page.getByRole("link", {name: "Cancelled", exact: true}).last().click();
            } else {
                await (await more(page)).getByRole("link", {name, exact: true}).click();
            }
            await expect(page).toHaveURL(url);
        }
        await page.goto("/dashboard/calendar");
        await (await more(page)).getByRole("link", {name: /Channel setup guide|Connect Booking\.com/}).click();
        await expect(page).toHaveURL(/\/dashboard\/help\/connect-calendars$/);
    });

    test("the More sheet closes with its button and with Escape", async ({page, signedIn}, testInfo) => {
        test.skip((testInfo.project.use.viewport?.width ?? 1280) >= 1024, "phones and tablets only");
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await page.getByRole("button", {name: "More", exact: true}).click();
        const sheet = page.getByRole("dialog", {name: "More"});
        await sheet.getByRole("button", {name: "Close menu"}).click();
        await expect(sheet).toBeHidden();
        await page.getByRole("button", {name: "More", exact: true}).click();
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
    });

    test("email notifications switch is saved and survives a reload", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Notify House", 1);
        await signedIn(owner);
        await page.goto("/dashboard/calendar");
        let toggle = (await more(page)).getByRole("switch", {name: "Email notifications"});
        await expect(toggle).toBeChecked();
        await toggle.click();
        await expect(page.getByText("Email notifications turned off.")).toBeVisible();
        expect((await api<{enabled: boolean}>("GET", "/api/notifications/settings", owner.token)).body.enabled).toBe(false);
        await page.reload();
        toggle = (await more(page)).getByRole("switch", {name: "Email notifications"});
        await expect(toggle).not.toBeChecked();
        await toggle.click();
        await expect(page.getByText("Email notifications turned on.")).toBeVisible();
    });

    test("the switch rolls back when saving fails", async ({page, signedIn, guard}) => {
        allowApiError(guard, 500);
        guard.allowFailedRequest(/notifications\/settings/);
        await signedIn("a");
        await page.route("**/api/notifications/settings", (route) => route.request().method() === "PUT"
            ? route.fulfill({status: 500, contentType: "application/json", body: "{}"}) : route.continue());
        await page.goto("/dashboard/calendar");
        const toggle = (await more(page)).getByRole("switch", {name: "Email notifications"});
        await expect(toggle).toBeChecked(); // loaded from the server (owner A has notifications on)
        await toggle.click();
        await expect(page.getByText(/^Couldn't change email notifications\./)).toBeVisible();
        await expect(toggle).toBeChecked();
    });

    test("dark mode is applied, remembered after reload, per account", async ({page, signedIn}) => {
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Theme House", 1);
        await signedIn(owner);
        await page.goto("/dashboard/calendar");
        const dark = (await more(page)).getByRole("switch", {name: "Dark mode"});
        await expect(dark).toBeEnabled();
        const was = (await dark.getAttribute("aria-checked")) === "true";
        await dark.click();
        await expect(dark).toHaveAttribute("aria-checked", String(!was));
        const themeOf = () => page.evaluate(() => [document.documentElement.dataset.theme ?? "", document.documentElement.className].join(" "));
        const after = await themeOf();
        await page.reload();
        await expect(page.getByRole("heading", {name: "Calendar"})).toBeVisible();
        expect(await themeOf()).toBe(after);
        await expect((await more(page)).getByRole("switch", {name: "Dark mode"})).toHaveAttribute("aria-checked", String(!was));
    });

    test("a language switch (Macedonian) exists", async ({page, signedIn}) => {
        test.fail(true, "FE-13: there is no i18n and no EN/MK switch; every string is hard-coded English (inventory §8). Report / owner decision.");
        await signedIn("a");
        await page.goto("/dashboard/calendar");
        await expect(page.getByRole("button", {name: /language|јазик|MK|Македонски/i}).or(page.getByRole("combobox", {name: /language/i})).first()).toBeVisible({timeout: 2000});
    });

    test("Contact support sends a message (backend has no inbox here → 503 is explained)", async ({page, signedIn, guard}) => {
        allowApiError(guard, 503);
        guard.allowFailedRequest(/\/api\/me\/support/);
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Support House", 1);
        await signedIn(owner);
        await page.goto("/dashboard/calendar");
        await (await more(page)).getByRole("button", {name: "Contact support"}).click();
        const dialog = page.getByRole("dialog", {name: "Contact support"});
        await dialog.getByLabel("Message").fill("Hello from the E2E suite.");
        await dialog.getByRole("button", {name: /^Send/}).click();
        // CONTACT_TO is empty in the E2E stack, so the server answers 503: the dialog must say so, not crash
        await expect(page.getByText(/Message sent|couldn't|can't|not available|try again/i).first()).toBeVisible();
    });
});

test.describe("account and privacy", () => {
    test("Download my data gives a JSON file of this account only", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/account");
        const download = page.waitForEvent("download");
        await page.getByRole("button", {name: "Download my data"}).click();
        const file = await download;
        expect(file.suggestedFilename()).toMatch(/\.json$/);
        const text = await (await import("node:fs")).promises.readFile((await file.path())!, "utf8");
        const data = JSON.parse(text);
        expect(text).toContain("owner-a@example.test");
        expect(text).not.toContain("owner-b@example.test");
        expect(text).not.toContain("B Guest");
        expect(text).not.toMatch(/password_?hash|"\$2[aby]\$/i);
        expect(data).toBeTruthy();
        await expect(page.getByText("Your data was downloaded.")).toBeVisible();
    });

    test("change password: wrong current password, then success signs the other sessions out", async ({page, signedIn, guard}) => {
        allowApiError(guard, 400);
        const owner = await createVerifiedOwner();
        const otherDevice = await login(owner.email, owner.password);
        await signedIn(owner);
        await page.goto("/dashboard/account");
        await page.getByRole("link", {name: "Change password"}).click();
        await page.getByLabel("Current password").fill("not-my-password");
        await page.getByLabel("New password", {exact: true}).fill("E2e-changed-Passw0rd!");
        await page.getByLabel("Confirm new password").fill("E2e-changed-Passw0rd!");
        await page.getByRole("button", {name: "Save"}).click();
        // The wrong password is cleared and the field marked; wait for that before typing again
        await expect(page.getByLabel("Current password")).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByLabel("Current password")).toHaveValue("");
        await expect(page.getByLabel("Current password")).toBeFocused();
        await page.getByLabel("Current password").fill(owner.password);
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page.getByText("Password changed. Your other devices were signed out.")).toBeVisible();
        // This tab keeps working with its fresh token; the other device's token is refused
        expect((await api("GET", "/api/me", otherDevice)).status).toBe(401);
        await page.goto("/dashboard/properties");
        await expect(page.getByRole("heading", {name: "Properties", level: 1})).toBeVisible();
    });

    test("delete my account: needs the password and DELETE, then signs out and the account is gone", async ({page, signedIn, guard}) => {
        allowApiError(guard, 400);
        // Observed: one GET /api/me still goes out with the deleted account's token right after deletion (401, harmless)
        guard.allowConsole(/status of 401.*\/api\/me/);
        guard.allowConsole(/\[RoomTrack\] Loading \["me"\]: GET \/api\/me 401/); // the app's own log of that same request
        const owner = await createVerifiedOwner();
        await signedIn(owner);
        await page.goto("/dashboard/account");
        const del = page.getByRole("button", {name: "Delete my account"});
        await expect(del).toBeDisabled();
        await page.getByLabel("Your password").fill("wrong-password");
        await page.getByLabel("Type DELETE to confirm").fill("delete");
        await expect(del).toBeDisabled();
        await page.getByLabel("Type DELETE to confirm").fill("DELETE");
        await del.click();
        await expect(page.getByText("Your password is not correct.")).toBeVisible();
        await expect(page.getByLabel("Your password")).toHaveValue("");
        await page.getByLabel("Your password").fill(owner.password);
        await del.click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByText(/Your account and everything in it were deleted/)).toBeVisible();
        expect((await api("POST", "/api/auth/login", null, {email: owner.email, password: owner.password})).status).toBe(401);
        expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("@")))).toEqual([]);
    });

    test("demo accounts cannot see Account and privacy in the sidebar", async ({page}, testInfo) => {
        test.skip((testInfo.project.use.viewport?.width ?? 0) < 1024, "sidebar only");
        await page.goto("/login");
        await page.getByRole("button", {name: "Try the demo"}).click();
        await expect(page.getByRole("region", {name: "Things to try"})).toBeVisible();
        const sidebar = page.getByRole("complementary", {name: "Main menu"});
        await expect(sidebar.getByRole("link", {name: "Account and privacy"})).toHaveCount(0);
        await expect(sidebar.getByRole("button", {name: "Contact support"})).toHaveCount(0);
    });
});

test.describe("public pages", () => {
    for (const [path, heading] of [
        ["/", /./], ["/privacy", /Privacy/i], ["/terms", /Terms/i], ["/contact", "Contact us"], ["/login", "Log in"],
        ["/register", /account/i], ["/forgot-password", /password/i],
    ] as const) {
        test(`${path} renders a heading`, async ({page}) => {
            await page.goto(path);
            await expect(page.getByRole("heading", {level: 1}).first()).toHaveText(heading);
        });
    }

    test("contact form: validation, then the server's answer is shown (no inbox in the E2E stack)", async ({page, guard}) => {
        allowApiError(guard, 503);
        guard.allowFailedRequest(/\/api\/contact/);
        await page.goto("/contact");
        await page.getByRole("button", {name: "Send message"}).click();
        await expect(page.locator(".field-error").first()).toBeVisible();
        await page.getByLabel("Your email").fill("visitor@example.test");
        await page.getByLabel("Subject").fill("Hello");
        await page.getByLabel("Message").fill("A question about RoomTrack.");
        await page.getByRole("button", {name: "Send message"}).click();
        await expect(page.getByRole("alert").or(page.getByText("Thanks for writing")).first()).toBeVisible();
    });

    test("verify-email without an address goes to login", async ({page}) => {
        await page.goto("/verify-email");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("signed in: an unknown page shows the 404 with a way back", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/dashboard/does-not-exist");
        await expect(page.getByRole("link", {name: "Go to calendar"})).toBeVisible();
        await page.getByRole("link", {name: "Go to calendar"}).click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    });

    test("signed in: /login and / go straight to the calendar", async ({page, signedIn}) => {
        await signedIn("a");
        await page.goto("/login");
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        await page.goto("/");
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    });
});
