import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {test, expect, allowApiError, signIn} from "./support/fixtures.ts";
import {API_CONTAINER, api, codeFromLogs, createProperty, createVerifiedOwner, day, psql, sqlString, TEST_PASSWORD} from "./support/backend.ts";
import {seed} from "./support/seed-data.ts";
import {logOut, pickStay} from "./support/ui.ts";

const PROTECTED = [
    "/dashboard", "/dashboard/calendar", "/dashboard/properties", "/dashboard/cancelled", "/dashboard/invoices",
    "/dashboard/conflicts", "/dashboard/sync-health", "/dashboard/account", "/dashboard/account/password",
    "/dashboard/reservations/new?unitId=x", "/dashboard/setup", "/dashboard/no-such-page",
];

test.describe("auth", () => {
    test("register → code from the backend log → verify → onboarding", async ({page}) => {
        const email = `e2e-reg-${randomUUID().slice(0, 8)}@example.test`;
        await page.goto("/register");
        await page.getByLabel("Full name").fill("Register Tester");
        await page.getByLabel("Contact phone").fill("+389 70 123 456");
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password", {exact: true}).fill(TEST_PASSWORD);
        await page.getByRole("checkbox", {name: /I agree to the/}).check();
        await page.getByRole("button", {name: "Create account"}).click();
        await expect(page).toHaveURL(/\/verify-email$/);
        const group = page.getByRole("group", {name: "Verification code"});
        await expect(group).toBeVisible();
        let code: string | null = null;
        await expect.poll(() => (code = codeFromLogs(email)), {timeout: 10_000}).not.toBeNull();
        await group.getByRole("textbox").first().click();
        await page.keyboard.type(code!); // the sixth digit submits
        await expect(page).toHaveURL(/\/dashboard\/setup$/);
        await expect(page.getByRole("heading", {name: "Add your property"})).toBeVisible();
        // Onboarding: one property with two rooms, then the calendar opens
        await page.getByLabel("Name", {exact: true}).fill("First Place");
        await page.getByLabel("Number of rooms").fill("2");
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        await expect(page.getByRole("link", {name: "Room 2"}).first()).toBeVisible();
    });

    test("verify: a wrong code shows an error and stays on the page", async ({page, guard}) => {
        allowApiError(guard, 400, "/api/auth/verify-email");
        const email = `e2e-wrong-${randomUUID().slice(0, 8)}@example.test`;
        await api("POST", "/api/auth/register", null, {
            email, password: TEST_PASSWORD, fullName: "Wrong Code", contactPhone: "", acceptedTerms: true,
            termsVersion: "2026-10-31", privacyVersion: "2026-10-31",
        });
        await page.goto("/login");
        guard.allowConsole(/status of 403/);
        guard.allowConsole(/\[RoomTrack\].*403/);
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password", {exact: true}).fill(TEST_PASSWORD);
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page).toHaveURL(/\/verify-email$/);
        const group = page.getByRole("group", {name: "Verification code"});
        await group.getByRole("textbox").first().click();
        await page.keyboard.type("000000");
        await expect(page.getByText(/code/i).filter({hasText: /invalid|expired|wrong/i}).first()).toBeVisible();
        await expect(page).toHaveURL(/\/verify-email$/);
    });

    test("register: validation messages on an empty form", async ({page}) => {
        await page.goto("/register");
        await page.getByRole("button", {name: "Create account"}).click();
        await expect(page).toHaveURL(/\/register$/);
        await expect(page.locator(".field-error, [role=alert]").first()).toBeVisible();
    });

    test("login with the right password goes to the calendar", async ({page}) => {
        await page.goto("/login");
        await page.getByLabel("Email").fill(seed().a.email);
        await page.getByLabel("Password", {exact: true}).fill(seed().password);
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        await expect(page.getByRole("heading", {name: "Calendar"})).toBeVisible();
    });

    test("login with a wrong password shows an error, clears and focuses the password", async ({page, guard}) => {
        allowApiError(guard, 401, "/api/auth/login");
        const owner = await createVerifiedOwner();
        await page.goto("/login");
        await page.getByLabel("Email").fill(owner.email);
        const password = page.getByLabel("Password", {exact: true});
        await password.fill("wrong-password-123");
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page.getByRole("alert").filter({hasText: /password/i}).first()).toBeVisible();
        await expect(password).toHaveValue("");
        await expect(password).toBeFocused();
        await expect(page).toHaveURL(/\/login$/);
    });

    test("an unverified account is sent to /verify-email after the right password", async ({page, guard}) => {
        allowApiError(guard, 403, "/api/auth/login");
        const email = `e2e-unv-${randomUUID().slice(0, 8)}@example.test`;
        const reg = await api("POST", "/api/auth/register", null, {
            email, password: TEST_PASSWORD, fullName: "Unverified", contactPhone: "", acceptedTerms: true,
            termsVersion: "2026-10-31", privacyVersion: "2026-10-31",
        });
        expect(reg.status).toBe(202);
        await page.goto("/login");
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password", {exact: true}).fill(TEST_PASSWORD);
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page).toHaveURL(/\/verify-email$/);
    });

    test("log out clears the token and the offline copy, and protected pages go back to login", async ({page, signedIn, guard}) => {
        // WebKit: queries still in flight right after log-out return 401 (no token any more); harmless
        guard.allowConsole(/status of 401/);
        // A fresh owner: since API-03 a log-out ends every session of that user, which would also sign out the
        // shared seed owners in parallel test workers.
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Logout House", 1);
        const token = await signedIn(owner);
        await page.goto("/dashboard/calendar");
        await expect(page.getByRole("heading", {name: "Calendar"})).toBeVisible();
        // The offline copy is written 500 ms after the calendar loads.
        await expect.poll(() => page.evaluate(() => localStorage.getItem("roomtrack.offlineCalendar") !== null)).toBe(true);
        await logOut(page);
        await expect(page).toHaveURL(/\/login$/);
        const storage = await page.evaluate(() => ({
            token: localStorage.getItem("auth_token"),
            offline: localStorage.getItem("roomtrack.offlineCalendar"),
        }));
        expect(storage).toEqual({token: null, offline: null});
        // API-03: the session also ended on the server, so a copy of the token is useless (every device signed out)
        await expect.poll(async () => (await api("GET", "/api/me", token)).status).toBe(401);
        await page.goto("/dashboard/calendar");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("register: a 37-letter Cyrillic password gets a clear message (BCrypt's 72-byte limit)", async ({page, guard}) => {
        // API-02: before the fix the server answered a generic "Invalid request"
        allowApiError(guard, 400, "/api/auth/register");
        await page.goto("/register");
        await page.getByLabel("Full name").fill("Марија Петровска");
        await page.getByLabel("Contact phone").fill("+389 70 123 456");
        await page.getByLabel("Email").fill(`e2e-cyr-${randomUUID().slice(0, 8)}@example.test`);
        await page.getByLabel("Password", {exact: true}).fill("ж".repeat(37));
        await page.getByRole("checkbox", {name: /I agree to the/}).check();
        await page.getByRole("button", {name: "Create account"}).click();
        await expect(page.getByText(/at most 72 bytes/)).toBeVisible();
        await expect(page).toHaveURL(/\/register$/);
    });

    test("expired / revoked session: the next API call ends it and returns to login with a note", async ({page, context, guard}) => {
        allowApiError(guard, 401);
        const owner = await createVerifiedOwner();
        await signIn(context, owner);
        await page.goto("/dashboard/properties");
        await expect(page.getByRole("heading", {name: "Properties", level: 1})).toBeVisible();
        // What a password change elsewhere does: the token version moves on, every older token is refused.
        psql(`UPDATE app_user SET token_version = token_version + 1 WHERE email = ${sqlString(owner.email)};`);
        await page.goto("/dashboard/cancelled");
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByText("Your session expired, please log in again.")).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
        expect(await page.evaluate(() => sessionStorage.getItem("roomtrack.returnTo"))).toBe("/dashboard/cancelled");
    });

    test("after the session expired, logging in again returns to the page that was open", async ({page, context, guard}) => {
        // FE-01 FIXED (LoginPage: one return target for navigate() and the signed-in redirect): regression test.
        allowApiError(guard, 401);
        const owner = await createVerifiedOwner();
        await createProperty(owner.token, "Return Place", 1);
        await signIn(context, owner);
        await page.goto("/dashboard/properties");
        await expect(page.getByRole("heading", {name: "Properties", level: 1})).toBeVisible();
        psql(`UPDATE app_user SET token_version = token_version + 1 WHERE email = ${sqlString(owner.email)};`);
        await page.goto("/dashboard/cancelled");
        await expect(page).toHaveURL(/\/login$/);
        await page.getByLabel("Email").fill(owner.email);
        await page.getByLabel("Password", {exact: true}).fill(owner.password);
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page).toHaveURL(/\/dashboard\/cancelled$/);
        // Stays there (the bug navigates away a moment later)
        await expect(page.getByRole("heading", {name: "Cancelled bookings", exact: true})).toBeVisible();
        await expect(page).toHaveURL(/\/dashboard\/cancelled$/);
    });

    test("a booking typed when the session ended is restored after logging in again", async ({page, context, guard}) => {
        // FE-01 FIXED: before, this was a race (Chromium 3 of 4 restored, WebKit 0 of 4). Regression test.
        allowApiError(guard, 401);
        const owner = await createVerifiedOwner();
        const {units} = await createProperty(owner.token, "Draft Place", 1);
        await signIn(context, owner);
        await page.goto(`/dashboard/reservations/new?unitId=${units[0].id}&checkIn=${day(10)}`);
        await page.getByLabel("Guest name").fill("Typed Before Expiry");
        psql(`UPDATE app_user SET token_version = token_version + 1 WHERE email = ${sqlString(owner.email)};`);
        await pickStay(page, null, day(12));
        await page.getByRole("button", {name: "Save"}).click();
        await expect(page).toHaveURL(/\/login$/);
        // The draft was put aside for this path and this account
        expect(await page.evaluate(() => sessionStorage.getItem("roomtrack.formDraft"))).toContain("Typed Before Expiry");
        await page.getByLabel("Email").fill(owner.email);
        await page.getByLabel("Password", {exact: true}).fill(owner.password);
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page).toHaveURL(/\/dashboard\/reservations\/new/);
        await expect(page.getByText("We kept what you typed. Check it and press Save.")).toBeVisible();
        await expect(page.getByLabel("Guest name")).toHaveValue("Typed Before Expiry");
    });

    test("a garbage token in storage ends the session instead of showing an empty app", async ({page, guard}) => {
        allowApiError(guard, 401);
        await page.addInitScript(() => {
            if (!sessionStorage.getItem("e2e.once")) {
                localStorage.setItem("auth_token", "not.a.jwt");
                sessionStorage.setItem("e2e.once", "1");
            }
        });
        await page.goto("/dashboard/calendar");
        await expect(page).toHaveURL(/\/login$/);
    });

    for (const path of PROTECTED) {
        test(`signed out: ${path} → /login`, async ({page}) => {
            await page.goto(path);
            await expect(page).toHaveURL(/\/login$/);
        });
    }

    test("open redirect: a return path outside /dashboard is ignored", async ({page}) => {
        await page.goto("/login");
        await page.evaluate(() => sessionStorage.setItem("roomtrack.returnTo", "//evil.example/steal"));
        await page.getByLabel("Email").fill(seed().a.email);
        await page.getByLabel("Password", {exact: true}).fill(seed().password);
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/dashboard\/calendar$/);
    });

    test("demo: 'Try the demo' signs in to sample data with the task dock", async ({page}) => {
        await page.goto("/login");
        await page.getByRole("button", {name: "Try the demo"}).click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
        await expect(page.getByRole("region", {name: "Things to try"})).toBeVisible();
        await expect(page.getByRole("link", {name: / · /}).first()).toBeVisible();
    });

    test("demo from the landing page", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Try the live demo"}).first().click();
        await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    });

    test("forgot password: email → code (from the backend log) → new password → log in", async ({page}) => {
        const owner = await createVerifiedOwner();
        await page.goto("/forgot-password");
        await page.getByLabel("Email").fill(owner.email);
        await page.getByRole("button", {name: "Send code"}).click();
        const group = page.getByRole("group", {name: "Reset code"});
        await expect(group).toBeVisible();
        let code: string | null = null;
        await expect.poll(() => (code = resetCodeFromLogs(owner.email)), {timeout: 10_000}).not.toBeNull();
        await group.getByRole("textbox").first().click();
        await page.keyboard.type(code!);
        const verify = page.getByRole("button", {name: "Verify"});
        if (await verify.isEnabled().catch(() => false)) await verify.click().catch(() => {});
        const newPassword = "E2e-new-Passw0rd!";
        await page.getByLabel("New password", {exact: true}).fill(newPassword);
        await page.getByLabel("Confirm new password").fill(newPassword);
        await page.getByRole("button", {name: "Change password"}).click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByText("Password changed, please sign in.")).toBeVisible();
        await page.getByLabel("Email").fill(owner.email);
        await page.getByLabel("Password", {exact: true}).fill(newPassword);
        await page.getByRole("button", {name: "Log in"}).click();
        await expect(page).toHaveURL(/\/dashboard/);
    });
});

function resetCodeFromLogs(email: string): string | null {
    const res = spawnSync("docker", ["logs", "--tail", "500", API_CONTAINER], {encoding: "utf8"});
    const line = `${res.stdout}\n${res.stderr}`.split(/\r?\n/).filter((l) => l.includes("reset code for " + email + ":")).at(-1);
    return line?.match(/: (\d{6})\s*$/)?.[1] ?? null;
}
