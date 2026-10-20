// import {useEffect, useRef} from "react"; // weekly install banner, switched off for now (see InstallNotice)
import {useState, type ReactNode} from "react";
import {useLocation} from "react-router-dom";
import {useRegisterSW} from "virtual:pwa-register/react";
import {bottomChrome} from "../lib/shellRoutes";
// import {installBanner, promptInstall} from "../lib/pwa"; // weekly install banner, switched off for now
import {iosInstallHint, useInstallMethod} from "../lib/pwa";
import {CloseIcon, InstallIcon, RefreshIcon, ShareIcon} from "./icons";
import Button from "./ui/Button";

// Look for a new version this often while the app stays open (it also looks when the app comes back to the front).
const UPDATE_CHECK_MS = 60 * 60 * 1000;
// If the new version hasn't taken over by then, reload anyway so nobody is left on a half-updated page.
const RELOAD_FALLBACK_MS = 4000;

/**
 * Small cards pinned above the toasts (ToastProvider places them): "A new version is available", or an invitation
 * to install the app. One at a time; the update wins.
 */
export default function AppNotices() {
    const [updating, setUpdating] = useState(false);
    const [updateClosed, setUpdateClosed] = useState(false);
    const {needRefresh: [needRefresh], updateServiceWorker} = useRegisterSW({
        onRegisteredSW(_url, registration) {
            if (!registration) return;
            const check = () => {
                if (registration.installing || !navigator.onLine) return;
                registration.update().catch(() => {
                    // Offline or the server hiccuped: the next check tries again.
                });
            };
            window.setInterval(check, UPDATE_CHECK_MS);
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") check();
            });
        },
    });

    function reload() {
        setUpdating(true);
        // Activates the waiting version; the page reloads as soon as it is in control.
        void updateServiceWorker(true);
        window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
    }

    if (needRefresh && !updateClosed) {
        return (
            <NoticeCard icon={<RefreshIcon size={18}/>} onClose={() => setUpdateClosed(true)} closeLabel="Update later"
                        action={<Button size="sm" onClick={reload} loading={updating}>Reload</Button>}>
                A new version is available
            </NoticeCard>
        );
    }
    return <InstallNotice/>;
}

/**
 * iPhone: how to add it to the home screen (until closed).
 * Chrome/Edge: the weekly "Install RoomTrack" banner is switched off for now; "Install app" in the menu still works.
 */
function InstallNotice() {
    const method = useInstallMethod();
    const {pathname} = useLocation();
    const [closed, setClosed] = useState(false);
    const onForm = bottomChrome(pathname) === "form";
    const visible = !closed && !onForm && (
        // (method === "prompt" && installBanner.isDue()) ||
        (method === "ios" && !iosInstallHint.isClosed())
    );

    // const recorded = useRef(false);
    // useEffect(() => {
    //     if (visible && method === "prompt" && !recorded.current) {
    //         recorded.current = true;
    //         installBanner.markShown();
    //     }
    // }, [visible, method]);

    if (!visible) return null;

    // Weekly install banner (Chrome/Edge):
    // if (method === "prompt") {
    //     return (
    //         <NoticeCard icon={<InstallIcon size={18}/>} closeLabel="Not now" onClose={() => setClosed(true)}
    //                     action={<Button size="sm" onClick={() => void promptInstall()}>Install</Button>}>
    //             Install RoomTrack as an app
    //         </NoticeCard>
    //     );
    // }

    return (
        <NoticeCard icon={<InstallIcon size={18}/>} closeLabel="Close tip" onClose={() => {
            iosInstallHint.close();
            setClosed(true);
        }}>
            Install RoomTrack: tap <ShareIcon size={16} className="mx-0.5 inline-block align-[-3px]"/> Share,
            then <span className="whitespace-nowrap">“Add to Home Screen”.</span>
        </NoticeCard>
    );
}

function NoticeCard({icon, children, action, onClose, closeLabel}: {
    icon: ReactNode;
    children: ReactNode;
    action?: ReactNode;
    onClose: () => void;
    closeLabel: string;
}) {
    return (
        <div className="pointer-events-auto flex w-full max-w-md animate-pop-in items-center gap-3 rounded-2xl border border-subtle bg-surface-raised py-2 pr-2 pl-4 text-body-sm font-semibold text-fg shadow-overlay">
            <span aria-hidden="true" className="shrink-0 text-on-primary-soft">{icon}</span>
            <span className="min-w-0 flex-1 py-1.5">{children}</span>
            {action}
            <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                title={closeLabel}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-hover hover:text-fg"
            >
                <CloseIcon size={18}/>
            </button>
        </div>
    );
}
