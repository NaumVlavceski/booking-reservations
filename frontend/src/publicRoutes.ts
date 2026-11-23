// The pages anyone may read without signing in, and what search engines should show for them. The single source of
// truth for: per-page title/description/canonical (usePageMeta), sitemap.xml (generated at build time) and the
// build checks and prerendered pages (dist/prerender/*.html) in scripts/seoPlugin.ts. Plain data only: vite.config.ts imports this file too.
//
// Every other route is private and gets <meta name="robots" content="noindex,nofollow"> while shown.
// Canonical form: https://roomtrack.app/path, no trailing slash (the home page is https://roomtrack.app/).

export const SITE_URL = "https://roomtrack.app";

/** The browser tab title on pages that are not listed here (as in index.html before this change). */
export const DEFAULT_TITLE = "RoomTrack";

export interface PublicRoute {
    /** Exactly as in App.tsx, without a trailing slash. */
    path: string;
    title: string;
    /** About 150 characters, never above 155. Written from the page's own text. */
    description: string;
    inSitemap: boolean;
    /** The page's one <h1>, as rendered. The build checks the prerendered HTML for it. */
    h1: string;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
    {
        path: "/",
        // index.html carries the same title and description (the build fails if they differ).
        title: "RoomTrack: One Calendar for Booking.com & Direct Bookings",
        description: "One calendar for apartment and guesthouse bookings. Sync Booking.com, add direct bookings, and double bookings are refused. Try the demo, no sign-up.",
        inSitemap: true,
        h1: "Every booking on one calendar.",
    },
    {
        path: "/terms",
        title: "Terms of Service | RoomTrack",
        description: "The agreement between you and RoomTrack: what RoomTrack does and doesn't promise, what you are responsible for, and how we handle your guests' details.",
        inSitemap: true,
        h1: "Terms of Service",
    },
    {
        path: "/privacy",
        title: "Privacy Policy | RoomTrack",
        description: "What RoomTrack stores about you and your guests, why, and how long we keep it. We only keep what the calendar needs, and we don't sell data or track you.",
        inSitemap: true,
        h1: "Privacy Policy",
    },
    {
        path: "/contact",
        title: "Contact | RoomTrack",
        description: "Questions, feedback or a problem with RoomTrack? Write to us here and we'll reply by email.",
        inSitemap: true,
        h1: "Contact us",
    },
    {
        path: "/help/connect-booking-com",
        title: "How to Connect Booking.com to RoomTrack",
        description: "Connect Booking.com to RoomTrack with two calendar links per room. Nothing to install, no passwords shared, about 5 minutes per room.",
        inSitemap: true,
        h1: "How to connect Booking.com to RoomTrack",
    },
];

/** "/terms/" and "/terms" are the same page; "/" stays "/". */
export function normalizePath(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
}

export function findPublicRoute(pathname: string): PublicRoute | undefined {
    const path = normalizePath(pathname);
    return PUBLIC_ROUTES.find((route) => route.path === path);
}

export function canonicalUrl(path: string): string {
    return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${normalizePath(path)}`;
}
