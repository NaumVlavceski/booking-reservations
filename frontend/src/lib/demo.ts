// "Try the demo" (POST /api/auth/demo): a private copy of the sample data for one visitor, deleted after 1 hour.
// The button shows when the build setting VITE_DEMO_ENABLED is "true" (a Netlify environment variable), which must
// match APP_DEMO_ENABLED on the backend. What a demo may not do is enforced by the backend.

import type {QueryClient} from "@tanstack/react-query";
import {tokenStorage} from "./auth/tokenStorage";
import {clearOfflineCalendar} from "./offlineCalendar";

export const DEMO_ENABLED = import.meta.env.VITE_DEMO_ENABLED === "true";

/** Signs out of the demo, on the way to the sign-up page. The server deletes the demo itself later. */
export function leaveDemo(queryClient: QueryClient) {
    tokenStorage.clear();
    clearOfflineCalendar();
    queryClient.clear();
}
