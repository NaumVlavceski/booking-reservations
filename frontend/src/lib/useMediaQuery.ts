import {useSyncExternalStore} from "react";

export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const list = window.matchMedia(query);
            list.addEventListener("change", onChange);
            return () => list.removeEventListener("change", onChange);
        },
        () => window.matchMedia(query).matches,
        // Build-time render (src/prerender.tsx) only: no screen, so no match. Never used in the browser (no hydration).
        () => false,
    );
}
