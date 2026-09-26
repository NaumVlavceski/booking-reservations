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
 * Where a form should go on back/cancel/save: the page that linked to it
 * (via `state.from`), or `fallback` when opened directly (e.g. a pasted URL).
 */
export function useReturnTo(fallback: string) {
    const location = useLocation();
    const navigate = useNavigate();
    const from = (location.state as ReturnState | null)?.from;

    function goBack() {
        // With `from` we know the previous history entry is that page, so a real
        // "back" avoids stacking a duplicate entry; otherwise replace this form.
        if (from) navigate(-1);
        else navigate(fallback, {replace: true});
    }

    return {to: from ?? fallback, from, goBack};
}
