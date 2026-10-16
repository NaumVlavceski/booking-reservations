import type {ReactNode} from "react";
import {promptInstall, useInstallMethod} from "../lib/pwa";
import {AddSquareIcon, ChevronRightIcon, InstallIcon, ShareIcon} from "./icons";
import Button from "./ui/Button";
import Sheet from "./ui/Sheet";

/**
 * "Install app" row for the menu. Chrome/Edge: opens the install dialog. iPhone/iPad: `onShowIosSteps` (the
 * menu shows IosInstallSheet). Hidden when the app is already installed or this browser can't install it.
 */
export default function InstallAppButton({onShowIosSteps, compact = false}: {
    onShowIosSteps: () => void;
    compact?: boolean;
}) {
    const method = useInstallMethod();
    if (!method) return null;
    return (
        <button
            type="button"
            onClick={() => (method === "ios" ? onShowIosSteps() : void promptInstall())}
            aria-haspopup={method === "ios" ? "dialog" : undefined}
            className={`flex w-full items-center rounded-xl text-left font-medium transition-colors hover:bg-surface-hover ${
                compact ? "min-h-11 gap-2.5 px-3 text-body-sm text-muted hover:text-fg" : "min-h-12 gap-3 px-3 text-body text-fg"
            }`}
        >
            <InstallIcon size={compact ? 18 : 20} className="shrink-0 text-muted"/>
            <span className="min-w-0 flex-1">Install app</span>
            {method === "ios" && !compact && <ChevronRightIcon size={18} className="text-subtle"/>}
        </button>
    );
}

/** iPhone/iPad have no install button: the two taps in Safari's Share menu. */
export function IosInstallSheet({open, onClose}: { open: boolean; onClose: () => void }) {
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Install RoomTrack"
            description="Add it to your home screen to open it like an app: full screen, with its own icon."
            showClose
            footer={<Button block onClick={onClose}>Got it</Button>}
        >
            <ol className="space-y-3 text-body text-fg">
                <Step number={1} icon={<ShareIcon size={20}/>}>
                    Tap <span className="font-semibold">Share</span> in the browser bar.
                </Step>
                <Step number={2} icon={<AddSquareIcon size={20}/>}>
                    Scroll down and tap <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>.
                </Step>
            </ol>
        </Sheet>
    );
}

function Step({number, icon, children}: { number: number; icon: ReactNode; children: ReactNode }) {
    return (
        <li className="flex items-center gap-3 rounded-2xl bg-surface-sunken px-3 py-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-on-primary-soft">
                {icon}
            </span>
            <span className="min-w-0 flex-1"><span className="sr-only">Step {number}: </span>{children}</span>
        </li>
    );
}
