import {useMutation} from "@tanstack/react-query";
import {useNavigate} from "react-router-dom";
import {startDemo} from "../lib/api/auth";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {clearOfflineCalendar} from "../lib/offlineCalendar";
import {errorKind, errorMessage} from "../lib/errors";
import Button from "./ui/Button";
import Callout from "./ui/Callout";

/** "Try the demo" on the login and register pages: a private copy of the sample data, signed in with one click. */
export default function TryDemo({className = ""}: { className?: string }) {
    const navigate = useNavigate();
    const demo = useMutation({
        mutationFn: startDemo,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            // A copy left by another account on this device is never shown to the demo
            clearOfflineCalendar();
            navigate("/dashboard/calendar", {replace: true});
        },
    });

    return (
        <div className={`space-y-3 ${className}`}>
            <Callout
                tone="info"
                title="Just looking around?"
                action={
                    <Button type="button" variant="secondary" onClick={() => demo.mutate()}
                            loading={demo.isPending} loadingLabel="Preparing your demo...">
                        Try the demo
                    </Button>
                }
            >
                <p>Try RoomTrack with your own copy of sample data. No sign-up needed.</p>
            </Callout>
            {demo.isError && (
                <Callout tone="danger" role="alert">
                    {/* 404: the demo is switched off on the server */}
                    {errorKind(demo.error) === "notFound"
                        ? "The demo is not available right now."
                        : errorMessage(demo.error, "Couldn't start the demo.")}
                </Callout>
            )}
        </div>
    );
}
