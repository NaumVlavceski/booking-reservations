import {useEffect, useId, useRef, type ReactNode} from "react";
import {createPortal} from "react-dom";
import {TrashIcon} from "./icons";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    pendingLabel?: string;
    pending?: boolean;
    error?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Destructive-action confirmation: centered card on desktop, bottom sheet on phones. */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Delete",
    pendingLabel = "Deleting...",
    pending = false,
    error,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const titleId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        // Focus Cancel, not Delete — a stray Enter shouldn't destroy anything.
        cancelRef.current?.focus();

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape" && !pending) onCancel();
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, pending, onCancel]);

    if (!open) return null;

    return createPortal(
        <div
            className="dialog-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4"
            onClick={() => !pending && onCancel()}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="dialog-panel w-full rounded-t-3xl bg-white p-6 pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)] shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pb-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <TrashIcon size={20}/>
                </div>
                <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
                <div className="mt-1.5 text-sm text-slate-500">{message}</div>

                {error && <p className="alert-error mt-4">{error}</p>}

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button ref={cancelRef} type="button" className="btn btn-secondary w-full sm:w-auto"
                            onClick={onCancel} disabled={pending}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn-danger w-full sm:w-auto" onClick={onConfirm}
                            disabled={pending}>
                        {pending ? pendingLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
