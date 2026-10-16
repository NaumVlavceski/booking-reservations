import {useLocation, useNavigate} from "react-router-dom";

export interface ReturnState {
    from?: string;
}

/** Link `state` that lets the destination page send the user back here. */
export function useFromHere(): ReturnState {
    const location = useLocation();
    return {from: location.pathname + location.search};
}

/**
 * Where back/cancel/save should go: the page you came from inside the app (whatever it was), or
 * `fallback` when this page was opened directly (a pasted URL, a new tab, a reload of the first page).
 */
export function useReturnTo(fallback: string) {
    const location = useLocation();
    const navigate = useNavigate();
    const from = (location.state as ReturnState | null)?.from;
    // React Router gives the very first page of a visit the key "default"; anything later has a page before it.
    const cameFromApp = Boolean(from) || location.key !== "default";

    function goBack() {
        // A real "back" returns to the previous page without stacking a duplicate history entry.
        if (cameFromApp) navigate(-1);
        else navigate(fallback, {replace: true});
    }

    return {to: from ?? fallback, from, goBack};
}
