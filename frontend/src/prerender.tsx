// Build-time only (scripts/seoPlugin.ts loads this in Node through Vite): renders a public page to static HTML, so
// crawlers get the real heading and text before any JavaScript runs. The browser does not hydrate this markup:
// main.tsx keeps createRoot, which replaces it with the live app exactly as before.
//
// It renders the page components directly, not App.tsx: App pulls in lib/pwa.ts, which touches `window` on import.
import type {ReactNode} from "react";
import {renderToString} from "react-dom/server";
import {StaticRouter} from "react-router-dom";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import ToastProvider from "./components/ToastProvider";
import LandingPage from "./pages/LandingPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import ContactPage from "./pages/ContactPage";
import HelpConnectBookingPage from "./pages/HelpConnectBookingPage";
import {APP_SCREENSHOT_FILES} from "./components/connectBookingGuideData";

/** One entry per path in src/publicRoutes.ts (the build fails if one is missing). */
const PAGES: Record<string, () => ReactNode> = {
    "/": () => <LandingPage/>,
    "/terms": () => <TermsPage/>,
    "/privacy": () => <PrivacyPolicyPage/>,
    "/contact": () => <ContactPage/>,
    "/help/connect-booking-com": () => <HelpConnectBookingPage/>,
};

export const prerenderPaths = Object.keys(PAGES);

/** Screenshots marked as signed-in only (connectBookingGuideData.ts): never on a public page. */
export const appOnlyFiles = APP_SCREENSHOT_FILES;

/** Signed-out visitor: no saved token or theme. Only for the render below; never runs in the browser. */
function signedOutStorage(): Storage {
    return {
        length: 0,
        clear: () => {},
        getItem: () => null,
        key: () => null,
        removeItem: () => {},
        setItem: () => {},
    };
}

export function renderPage(path: string): string {
    const page = PAGES[path];
    if (!page) throw new Error(`No prerender page for ${path}`);
    const g = globalThis as {localStorage?: Storage};
    g.localStorage ??= signedOutStorage();
    return renderToString(
        <QueryClientProvider client={new QueryClient()}>
            <StaticRouter location={path}>
                <ToastProvider>{page()}</ToastProvider>
            </StaticRouter>
        </QueryClientProvider>,
    );
}
