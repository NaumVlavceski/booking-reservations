import {type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useLocation} from "react-router-dom";
import {ToastContext, type ToastOptions, type ToastTone} from "../lib/toast";
import {bottomChrome} from "../lib/shellRoutes";
import {AlertIcon, CheckCircleIcon, CloseIcon, InfoIcon} from "./icons";

interface ActiveToast extends ToastOptions {
    id: number;
    message: string;
}

// Solid colour per tone, so a toast stands out on any page in either theme (text/background pairs are AA in both).
const TONE: Record<ToastTone, { box: string; icon: ReactNode; action: string }> = {
    success: {box: "bg-success-solid text-on-success-solid", icon: <CheckCircleIcon/>, action: "underline"},
    info: {box: "bg-info-solid text-on-info-solid", icon: <InfoIcon/>, action: "underline"},
    error: {box: "bg-danger-solid text-on-danger-solid", icon: <AlertIcon/>, action: "underline"},
};

// Just above the tab bar (phones) or a form's Save bar (all sizes); otherwise near the bottom.
const OFFSET = {
    tabs: "bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+0.75rem)] sm:bottom-6",
    form: "bottom-[calc(5rem+env(safe-area-inset-bottom)+0.75rem)] sm:bottom-24",
    none: "bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:bottom-6",
} as const;

/** Holds one toast at a time — a newer message replaces the older one. */
export default function ToastProvider({children}: { children: ReactNode }) {
    const [toast, setToast] = useState<ActiveToast | null>(null);
    const timerRef = useRef<number | undefined>(undefined);
    const nextId = useRef(0);
    const {pathname} = useLocation();

    const dismiss = useCallback(() => {
        window.clearTimeout(timerRef.current);
        setToast(null);
    }, []);

    const show = useCallback((message: string, options: ToastOptions = {}) => {
        window.clearTimeout(timerRef.current);
        nextId.current += 1;
        setToast({id: nextId.current, message, ...options});
        // Toasts with an action (Undo) or bad news stay longer, so there's time to read and tap.
        const duration = options.durationMs ?? (options.action ? 7000 : options.tone === "error" ? 6000 : 4000);
        timerRef.current = window.setTimeout(() => setToast(null), duration);
    }, []);

    useEffect(() => () => window.clearTimeout(timerRef.current), []);

    const api = useMemo(() => ({show}), [show]);
    const tone = TONE[toast?.tone ?? "success"];
    const isError = toast?.tone === "error";

    const card = toast && (
        <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-md animate-pop-in items-center gap-3 rounded-2xl py-2 pr-2 pl-4 text-body-sm font-semibold shadow-overlay ring-1 ring-black/10 ${tone.box}`}
        >
            <span className="shrink-0">{tone.icon}</span>
            <span className="min-w-0 flex-1 py-1.5">{toast.message}</span>
            {toast.action && (
                <button
                    type="button"
                    onClick={() => {
                        toast.action!.onClick();
                        dismiss();
                    }}
                    className={`min-h-11 shrink-0 rounded-xl px-3 font-bold hover:bg-current/10 ${tone.action}`}
                >
                    {toast.action.label}
                </button>
            )}
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss message"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl opacity-80 hover:bg-current/10 hover:opacity-100"
            >
                <CloseIcon size={18}/>
            </button>
        </div>
    );

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className={`pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4 ${OFFSET[bottomChrome(pathname)]}`}>
                <div role="status" aria-live="polite" className="contents">{!isError && card}</div>
                <div role="alert" className="contents">{isError && card}</div>
            </div>
        </ToastContext.Provider>
    );
}
