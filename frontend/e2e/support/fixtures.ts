import {test as base, expect, type Page, type BrowserContext, type ConsoleMessage, type Request, type Response} from "@playwright/test";
import {login} from "./backend.ts";
import {seed} from "./seed-data.ts";

// Every spec imports `test` from here. The `guard` fixture fails a test on:
//   - an uncaught page error (pageerror) or an unhandled promise rejection
//   - any console.error / console.assert
//   - a request that failed at the network level (except aborts caused by navigation) or got a 5xx answer
// A test that provokes an error on purpose declares it: guard.allowConsole(/.../), guard.allowFailedRequest(/.../).

export interface Guard {
    allowConsole(pattern: RegExp): void;
    allowFailedRequest(pattern: RegExp): void;
    /** Everything recorded so far (for assertions in tests that expect errors). */
    readonly problems: string[];
}

type Who = "a" | "b" | "zero" | "perf" | {email: string; password?: string; token?: string};

const tokenCache = new Map<string, string>();

export async function tokenFor(who: Who): Promise<string> {
    if (typeof who === "object" && who.token) return who.token;
    const email = typeof who === "object" ? who.email : seed()[who].email;
    const password = typeof who === "object" ? who.password : undefined;
    const cached = tokenCache.get(email);
    if (cached) return cached;
    const token = await login(email, password ?? seed().password);
    tokenCache.set(email, token);
    return token;
}

/** After a real sign-out (API-03 ends every session of the user) the cached token is dead: get a new one next time. */
export function forgetToken(who: Who) {
    tokenCache.delete(typeof who === "object" ? who.email : seed()[who].email);
}

/**
 * Signs the browser context in as an owner by putting a token in localStorage before the app starts, once per tab
 * (so a later log-out in the test is not undone by the next navigation).
 */
export async function signIn(context: BrowserContext, who: Who): Promise<string> {
    const token = await tokenFor(who);
    await context.addInitScript((t) => {
        try {
            if (!sessionStorage.getItem("e2e.signedIn")) {
                localStorage.setItem("auth_token", t);
                sessionStorage.setItem("e2e.signedIn", "1");
            }
        } catch {
            // about:blank and similar
        }
    }, token);
    return token;
}

export const test = base.extend<{guard: Guard; signedIn: (who: Who) => Promise<string>}>({
    guard: [async ({page}, provide, testInfo) => {
        const problems: string[] = [];
        const allowedConsole: RegExp[] = [];
        const allowedRequests: RegExp[] = [];
        const record = (kind: string, text: string, allowed: RegExp[]) => {
            // A Content-Security-Policy violation (SEC-06) can never be allowed by a test
            if (!/CSP violation|Content Security Policy/i.test(text) && allowed.some((re) => re.test(text))) return;
            problems.push(`${kind}: ${text}`);
        };

        await page.addInitScript(() => {
            // public/_headers' CSP is served by the E2E UI server too: every blocked script, style, font, image or
            // connection fails the test (SEC-06), including inside the service worker's pages.
            document.addEventListener("securitypolicyviolation", (event) => {
                console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || "inline"} (${event.sourceFile}:${event.lineNumber})`);
            });
            window.addEventListener("unhandledrejection", (event) => {
                console.error(`unhandledrejection: ${String((event as PromiseRejectionEvent).reason)}`);
            });
            // The iPhone "Install RoomTrack" tip covers the bottom of the screen until closed (finding FE-21, tested on
            // its own in mobile.spec.ts). Other tests start with it closed, as for a user who closed it once.
            try {
                localStorage.setItem("roomtrack.iosInstallHint.closed", "1");
            } catch {
                // about:blank
            }
        });
        // WebKit reports an XHR cancelled by a page navigation as "XMLHttpRequest cannot load … due to access control
        // checks" (a pageerror/console error), even on the same origin. Chromium reports the same thing as ERR_ABORTED.
        const webkitCancel = /XMLHttpRequest cannot load [\s\S]*due to access control checks/;
        const onConsole = (msg: ConsoleMessage) => {
            if (msg.type() === "error" || msg.type() === "assert") {
                if (webkitCancel.test(msg.text())) return;
                const loc = msg.location();
                record("console.error", `${msg.text()}${loc.url ? ` (${loc.url}:${loc.lineNumber})` : ""}`, allowedConsole);
            }
        };
        const onPageError = (err: Error) => {
            // (WebKit splits that text at "http:" into name and message)
            if (webkitCancel.test(`${err.name}: ${err.message}`)) return;
            record("pageerror", `${err.name}: ${err.message}`, allowedConsole);
        };
        const onFailed = (req: Request) => {
            const failure = req.failure()?.errorText ?? "";
            // Cancelled by navigation / unmount (net::ERR_ABORTED, WebKit "cancelled") is normal browser behaviour.
            if (/ERR_ABORTED|cancelled|Load request cancelled/i.test(failure)) return;
            record("requestfailed", `${req.method()} ${req.url()} ${failure}`, allowedRequests);
        };
        const onResponse = (res: Response) => {
            if (res.status() >= 500) record("http5xx", `${res.request().method()} ${res.url()} → ${res.status()}`, allowedRequests);
        };
        page.on("console", onConsole);
        page.on("pageerror", onPageError);
        page.on("requestfailed", onFailed);
        page.on("response", onResponse);
        // Pages opened later in the same context (second tab, popups) are watched too.
        page.context().on("page", (p) => {
            p.on("console", onConsole);
            p.on("pageerror", onPageError);
            p.on("requestfailed", onFailed);
            p.on("response", onResponse);
        });

        const guard: Guard = {
            allowConsole: (re) => allowedConsole.push(re),
            allowFailedRequest: (re) => allowedRequests.push(re),
            get problems() {
                return problems;
            },
        };
        await provide(guard);

        if (problems.length > 0) {
            await testInfo.attach("guard-problems", {body: problems.join("\n"), contentType: "text/plain"});
        }
        // Only judge tests that otherwise passed (or were expected to fail), so the real failure stays readable.
        if (testInfo.status === testInfo.expectedStatus || testInfo.expectedStatus === "failed") {
            expect(problems, "uncaught errors, console errors or failed requests").toEqual([]);
        }
    }, {auto: true}],

    signedIn: async ({context}, provide) => {
        await provide((who) => signIn(context, who));
    },
});

export {expect};

/** The app logs every failed API call with console.error and Chromium logs the 4xx itself; allow both for one status. */
export function allowApiError(guard: Guard, status: number, path: RegExp | string = "") {
    const p = typeof path === "string" ? path : path.source;
    guard.allowConsole(new RegExp(`status of ${status}`));
    guard.allowConsole(new RegExp(`\\[RoomTrack\\].*${p}.*${status}`));
    guard.allowConsole(new RegExp(`\\[RoomTrack\\].*${status}`));
}

export async function gotoApp(page: Page, path: string) {
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
}

export const isMobileProject = (name: string) => name.includes("mobile") || name.includes("360");
