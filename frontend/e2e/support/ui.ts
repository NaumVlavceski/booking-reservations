import {expect, type Locator, type Page, type TestInfo} from "@playwright/test";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-12-05" → "5 December 2026", the start of a day button's accessible name (dayPickerLabels.ts). */
export function longDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The day button for a date in an open react-day-picker, paging months forward/back until it is shown. */
export async function dayButton(scope: Page | Locator, iso: string): Promise<Locator> {
    const button = scope.getByRole("button", {name: new RegExp(`^${longDate(iso)},`)});
    for (let i = 0; i < 30 && !(await button.isVisible().catch(() => false)); i++) {
        const shown = await scope.getByRole("grid").first().getAttribute("aria-label").catch(() => null);
        const forward = !shown || new Date(`${shown} 1`).getTime() <= new Date(iso).getTime();
        await scope.getByRole("button", {name: forward ? /next month/i : /previous month/i}).first().click();
    }
    return button;
}

/** Fills Check-in / Check-out in a StayDatesPicker (the form's "Stay" section). */
export async function pickStay(page: Page, checkIn: string | null, checkOut: string) {
    if (checkIn) {
        await page.getByRole("button", {name: /^Check-in/}).click();
        await (await dayButton(page, checkIn)).click();
    } else {
        await page.getByRole("button", {name: /^Check-out/}).click();
    }
    await (await dayButton(page, checkOut)).click();
    // Picking the check-out closes the panel
    await expect(page.getByRole("button", {name: "Done"})).toBeHidden();
}

export const isPhone = (testInfo: TestInfo) => {
    const vp = testInfo.project.use.viewport;
    return (vp?.width ?? 1280) < 640;
};

/** The main navigation's "Log out": the sidebar icon button on desktop, the More sheet on phones/tablets. */
export async function logOut(page: Page) {
    const sidebar = page.getByRole("complementary", {name: "Main menu"}).getByRole("button", {name: "Log out"});
    if (await sidebar.isVisible().catch(() => false)) {
        await sidebar.click();
        return;
    }
    await page.getByRole("button", {name: "More", exact: true}).click();
    await page.getByRole("dialog", {name: "More"}).getByRole("button", {name: "Log out"}).click();
}

/** Opens a "More" destination on phones/tablets, or follows the sidebar link on desktop. */
export async function openNav(page: Page, name: string) {
    const sidebar = page.getByRole("complementary", {name: "Main menu"}).getByRole("link", {name, exact: true});
    if (await sidebar.isVisible().catch(() => false)) {
        await sidebar.click();
        return;
    }
    await page.getByRole("button", {name: "More", exact: true}).click();
    await page.getByRole("dialog", {name: "More"}).getByRole("link", {name, exact: true}).click();
}
