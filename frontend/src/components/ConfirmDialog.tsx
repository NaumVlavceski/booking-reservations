import {useRef, type ReactNode} from "react";
import {TrashIcon, WarningIcon} from "./icons";
import Button from "./ui/Button";
import Sheet from "./ui/Sheet";
import Callout from "./ui/Callout";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    /** Label of the button that closes without acting, e.g. "Keep booking" when confirming a cancellation. */
    cancelLabel?: string;
    pendingLabel?: string;
    pending?: boolean;
    error?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
    /** "danger" (default) is for destructive actions like delete; "neutral" is for e.g. discarding unsaved changes. */
    variant?: "danger" | "neutral";
}

/** Confirmation: a bottom sheet on phones, a centred dialog from sm up. Focus starts on the safe choice. */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    pendingLabel = "Deleting...",
    pending = false,
    error,
    onConfirm,
    onCancel,
    variant = "danger",
}: ConfirmDialogProps) {
    // Focus Cancel, not Delete — a stray Enter shouldn't destroy anything.
    const cancelRef = useRef<HTMLButtonElement>(null);

    return (
        <Sheet
            open={open}
            onClose={onCancel}
            role="alertdialog"
            title={title}
            description={message}
            icon={
                <span className={`flex size-11 items-center justify-center rounded-full ${
                    variant === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                }`}>
                    {variant === "danger" ? <TrashIcon size={20}/> : <WarningIcon size={20}/>}
                </span>
            }
            initialFocusRef={cancelRef}
            dismissible={!pending}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button ref={cancelRef} variant="secondary" size="lg" className="sm:min-h-11 sm:rounded-xl sm:text-[0.9375rem]"
                            onClick={onCancel} disabled={pending}>
                        {cancelLabel}
                    </Button>
                    <Button variant={variant === "danger" ? "danger" : "primary"} size="lg"
                            className="sm:min-h-11 sm:rounded-xl sm:text-[0.9375rem]"
                            onClick={onConfirm} loading={pending} loadingLabel={pendingLabel}>
                        {confirmLabel}
                    </Button>
                </div>
            }
        >
            {error && <Callout tone="danger">{error}</Callout>}
        </Sheet>
    );
}
