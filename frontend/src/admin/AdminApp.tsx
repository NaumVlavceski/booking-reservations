// The admin panel (/admin/*). Lazy-loaded from App.tsx: owners never download it, and the service worker never
// precaches it. Lazy loading is for speed only; every rule is enforced by the server.
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Navigate, Route, Routes, useNavigate} from "react-router-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import axios from "axios";
import {useToast} from "../lib/toast";
import {errorCode, errorMessage} from "../lib/errors";
import {applyAccountTheme} from "../lib/theme";
import {meQuery} from "../lib/api/me";
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import {LogoutIcon} from "../components/icons";
import {adminSession, useAdminSession} from "./adminSession";
import {extendAdminSession, getBadge, logoutAdmin, refreshAdminSession} from "./adminApi";
import {AdminShellContext, type AdminShell} from "./AdminContext";
import AdminVerifyDialog from "./AdminVerifyDialog";
import AdminLayout from "./AdminLayout";
import AdminOverviewPage from "./AdminOverviewPage";
import AdminOwnersPage from "./AdminOwnersPage";
import AdminOwnerPage from "./AdminOwnerPage";
import AdminAuditPage from "./AdminAuditPage";
import {ClockIcon, mmss} from "./adminUi";

const WINDOW_SECONDS = 30 * 60;
const WARN_AT = 60;
const OWNER_HOME = "/dashboard/calendar";

/** Admin pages must never be indexed; _headers sends X-Robots-Tag too. */
function useNoIndex() {
    useEffect(() => {
        const meta = document.createElement("meta");
        meta.name = "robots";
        meta.content = "noindex, nofollow";
        document.head.append(meta);
        const title = document.title;
        document.title = "Admin · RoomTrack";
        return () => {
            meta.remove();
            document.title = title;
        };
    }, []);
}

function secondsUntil(iso: string | undefined): number {
    return iso ? Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)) : 0;
}

export default function AdminApp() {
    useNoIndex();
    const session = useAdminSession();
    const navigate = useNavigate();
    const toast = useToast();
    const queryClient = useQueryClient();
    const {data: me} = useQuery(meQuery);
    useEffect(() => {
        if (me?.email) applyAccountTheme(me.email);
    }, [me?.email]);

    // Owners who are not admins never see the panel (the server would answer 404 anyway)
    const notAdmin = me !== undefined && !me.isAdmin;

    const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(session?.expiresAt));
    const [extending, setExtending] = useState(false);
    const [hadSession, setHadSession] = useState(Boolean(session));
    if (session && !hadSession) setHadSession(true);
    const ending = useRef(false);

    useEffect(() => {
        if (!session) return;
        const tick = () => setSecondsLeft(secondsUntil(session.expiresAt));
        tick();
        const t = window.setInterval(tick, 1000);
        return () => window.clearInterval(t);
    }, [session]);

    // A phone that slept: ask the server for the real expiry as soon as the page is visible again
    useEffect(() => {
        function onVisible() {
            if (document.visibilityState === "visible" && adminSession.get()) void refreshAdminSession().catch(() => {});
        }
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, []);

    // While leaving, render nothing: otherwise the cleared session would show the code dialog (and email a code)
    const [leaving, setLeaving] = useState(false);
    const leave = useCallback(async (message: string) => {
        if (ending.current) return;
        ending.current = true;
        setLeaving(true);
        await logoutAdmin();
        adminSession.clear();
        queryClient.removeQueries({queryKey: ["admin"]});
        navigate(OWNER_HOME, {replace: true});
        toast.show(message, {tone: "info"});
    }, [navigate, queryClient, toast]);

    // Automatic logout at expiry
    useEffect(() => {
        if (session && secondsLeft <= 0 && secondsUntil(session.expiresAt) <= 0) {
            void leave("Your admin session ended. You're back in the owner app.");
        }
    }, [secondsLeft, session, leave]);

    const extend = useCallback(async () => {
        setExtending(true);
        try {
            const res = await extendAdminSession();
            adminSession.updateExpiry(res.expiresAt, res.maxExpiresAt);
            toast.show("Admin session extended by 30 minutes.", {tone: "success"});
        } catch (e) {
            if (axios.isAxiosError(e) && errorCode(e) === "ADMIN_SESSION_CAP") {
                toast.show("The session can't be extended any further. Confirm a new code when it ends.", {tone: "error"});
            } else {
                toast.show(errorMessage(e, "The session couldn't be extended."), {tone: "error"});
            }
        } finally {
            setExtending(false);
        }
    }, [toast]);

    const badge = useQuery({
        queryKey: ["admin", "badge"],
        queryFn: getBadge,
        enabled: Boolean(session),
        refetchInterval: 60_000,
    });

    const shell: AdminShell = useMemo(() => ({
        secondsLeft,
        windowSeconds: WINDOW_SECONDS,
        extend,
        extending,
        logout: () => leave("You logged out of Admin."),
        needHelp: badge.data?.needHelp ?? 0,
    }), [secondsLeft, extend, extending, leave, badge.data?.needHelp]);

    if (notAdmin) return <Navigate to={OWNER_HOME} replace/>;
    if (leaving) return null;

    if (!session) {
        return (
            <div className="min-h-dvh bg-canvas">
                <AdminVerifyDialog
                    open
                    reason={hadSession ? "Your admin session ended or was closed." : undefined}
                    onClose={() => navigate(OWNER_HOME, {replace: true})}
                    onVerified={() => {
                        ending.current = false;
                        setLeaving(false);
                        void queryClient.invalidateQueries({queryKey: ["admin"]});
                    }}
                />
            </div>
        );
    }

    return (
        <AdminShellContext.Provider value={shell}>
            <AdminLayout>
                <Routes>
                    <Route index element={<AdminOverviewPage/>}/>
                    <Route path="owners" element={<AdminOwnersPage/>}/>
                    <Route path="owners/:id" element={<AdminOwnerPage/>}/>
                    <Route path="audit" element={<AdminAuditPage/>}/>
                    <Route path="*" element={<Navigate to="/admin" replace/>}/>
                </Routes>
            </AdminLayout>
            <SessionEndingDialog open={secondsLeft > 0 && secondsLeft <= WARN_AT} seconds={secondsLeft}
                                 onContinue={extend} extending={extending} onLogout={shell.logout}/>
        </AdminShellContext.Provider>
    );
}

function SessionEndingDialog({open, seconds, onContinue, extending, onLogout}: {
    open: boolean;
    seconds: number;
    onContinue: () => Promise<void>;
    extending: boolean;
    onLogout: () => Promise<void>;
}) {
    return (
        <Sheet open={open} onClose={() => void onContinue()} role="alertdialog" dismissible={false}
               title="Admin session ends soon"
               icon={
                   <span className="mx-auto flex size-14 items-center justify-center rounded-card bg-warning-soft text-warning sm:mx-0">
                       <ClockIcon size={26}/>
                   </span>
               }
               description="You will be logged out of Admin and returned to the owner app.">
            <p className="num mb-5 text-center text-[2.75rem] leading-none font-bold text-warning" aria-live="polite">{mmss(seconds)}</p>
            <div className="space-y-2">
                <Button block size="lg" onClick={() => void onContinue()} loading={extending} loadingLabel="Extending…">
                    Continue for 30 more minutes
                </Button>
                <Button block size="lg" variant="secondary" icon={<LogoutIcon size={18}/>} onClick={() => void onLogout()}>
                    Log out of Admin
                </Button>
            </div>
        </Sheet>
    );
}
