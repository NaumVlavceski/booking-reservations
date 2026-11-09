import {useMutation} from "@tanstack/react-query";
import {useNavigate} from "react-router-dom";
import {startDemo} from "./api/auth";
import {tokenStorage} from "./auth/tokenStorage";
import {clearOfflineCalendar} from "./offlineCalendar";
import {errorKind, errorMessage} from "./errors";

/** Starts a private demo (lib/demo.ts) and opens its calendar. Used by the login, register and home pages. */
export function useStartDemo() {
    const navigate = useNavigate();
    return useMutation({
        mutationFn: startDemo,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            // A copy left by another account on this device is never shown to the demo
            clearOfflineCalendar();
            navigate("/dashboard/calendar", {replace: true});
        },
    });
}

/** Why the demo didn't start, in words for the visitor. */
export function demoErrorMessage(error: unknown): string {
    // 404: the demo is switched off on the server
    return errorKind(error) === "notFound" ? "The demo is not available right now." : errorMessage(error, "Couldn't start the demo.");
}
