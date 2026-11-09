import {demoErrorMessage, useStartDemo} from "../lib/useStartDemo";
import Button from "./ui/Button";
import Callout from "./ui/Callout";

/** "Try the demo" on the login and register pages: a private copy of the sample data, signed in with one click. */
export default function TryDemo({className = ""}: { className?: string }) {
    const demo = useStartDemo();

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
                <Callout tone="danger" role="alert">{demoErrorMessage(demo.error)}</Callout>
            )}
        </div>
    );
}
