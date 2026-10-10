import {type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ToastContext, type ToastOptions} from "../lib/toast";
import {CloseIcon} from "./icons";

interface ActiveToast extends ToastOptions {
    id: number;
    message: string;
}

const TONE_CLASS = {
    success: "bg-slate-900 text-white",
    info: "bg-slate-900 text-white",
    error: "bg-red-700 text-white",
} as const;

/** Holds one toast at a time — a newer message replaces the older one. */
export default function ToastProvider({children}: { children: ReactNode }) {
    const [toast, setToast] = useState<ActiveToast | null>(null);
    const timerRef = useRef<number | undefined>(undefined);
    const nextId = useRef(0);

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

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 sm:bottom-6"
            >
                {toast && (
                    <div
                        key={toast.id}
                        className={`dialog-panel pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl py-2 pr-2 pl-4 text-sm font-medium shadow-xl ${TONE_CLASS[toast.tone ?? "success"]}`}
                    >
                        <span className="min-w-0 flex-1 py-1.5">{toast.message}</span>
                        {toast.action && (
                            <button
                                type="button"
                                onClick={() => {
                                    toast.action!.onClick();
                                    dismiss();
                                }}
                                className="shrink-0 rounded-lg px-3 py-2 font-semibold text-teal-300 hover:bg-white/10"
                            >
                                {toast.action.label}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={dismiss}
                            aria-label="Dismiss message"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                        >
                            <CloseIcon size={16}/>
                        </button>
                    </div>
                )}
            </div>
        </ToastContext.Provider>
    );
}
