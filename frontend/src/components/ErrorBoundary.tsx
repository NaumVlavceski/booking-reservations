import {Component, type ErrorInfo, type ReactNode} from "react";
import {AlertIcon} from "./icons";
import Button from "./ui/Button";
import {buttonClass} from "./ui/buttonStyles";
import Card from "./ui/Card";
import {logError} from "../lib/errors";

interface Props {
    children: ReactNode;
}

/**
 * Catches a crash while drawing the screen and shows a calm "Something went wrong" page instead of a white one.
 * Used twice: around the whole app, and around each page inside the menu (keyed by address, so leaving the
 * page clears it).
 */
export default class ErrorBoundary extends Component<Props, { crashed: boolean }> {
    state = {crashed: false};

    static getDerivedStateFromError() {
        return {crashed: true};
    }

    componentDidCatch(error: unknown, info: ErrorInfo) {
        logError(error, "Screen crashed");
        console.error(info.componentStack);
    }

    render() {
        return this.state.crashed ? <CrashScreen/> : this.props.children;
    }
}

function CrashScreen() {
    return (
        <div className="px-4 pt-[env(safe-area-inset-top)] sm:px-0">
            <Card className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center sm:mt-12">
                <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                    <AlertIcon size={28}/>
                </span>
                <div role="alert">
                    <h1 className="text-title-1 text-fg">Something went wrong</h1>
                    <p className="mt-3 max-w-sm text-body-sm text-muted">
                        This screen ran into a problem. Reloading usually fixes it. Your bookings are safe.
                    </p>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button size="lg" onClick={() => window.location.reload()}>Reload</Button>
                    {/* A full page load, not router navigation: the app's state may be what broke. */}
                    <a href="/dashboard/calendar" className={buttonClass({variant: "secondary", size: "lg"})}>Back to calendar</a>
                </div>
            </Card>
        </div>
    );
}
