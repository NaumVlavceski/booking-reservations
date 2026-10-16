import type {MouseEvent} from "react";
import {useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {CheckIcon, ChevronLeftIcon, TrashIcon, WifiOffIcon} from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import Button from "./ui/Button";
import {useOnlineStatus} from "../lib/useOnlineStatus";

interface FormTopBarProps {
    /** id of the <form> to submit — Save sits outside it, so it targets it via form="…". */
    formId: string;
    saving: boolean;
    back?: { to: string; label: string; onClick?: (e: MouseEvent) => void };
    /** Shows a delete button next to Save (edit mode). */
    onDelete?: () => void;
    deleteLabel?: string;
    /** Label describing the current action, e.g. "Reservation Room 1", "Edit property". The page's heading. */
    title?: string;
    /** Second line under the title, e.g. the property a room belongs to. */
    subtitle?: string;
    /** When true, leaving via `back` first asks to confirm — used once the form has unsaved changes. */
    isDirty?: boolean;
}

/**
 * Header for edit forms: back, title, delete. Save is in the header from sm up and in a sticky bar at
 * the bottom on phones, where the thumb is. Both submit the same form.
 */
export default function FormTopBar({formId, saving, back, onDelete, deleteLabel = "Delete", title, subtitle, isDirty = false}: FormTopBarProps) {
    const navigate = useNavigate();
    const online = useOnlineStatus();
    const [confirmExit, setConfirmExit] = useState(false);

    function handleBackClick(e: MouseEvent) {
        if (isDirty) {
            e.preventDefault();
            setConfirmExit(true);
        } else {
            back?.onClick?.(e);
        }
    }

    function handleExit() {
        setConfirmExit(false);
        if (!back) return;
        if (back.onClick) {
            back.onClick({preventDefault: () => {}} as MouseEvent);
        } else {
            navigate(back.to);
        }
    }

    const saveButton = (block: boolean) => (
        <Button type="submit" form={formId} size={block ? "lg" : "md"} block={block} loading={saving} loadingLabel="Saving..."
                disabled={!online} icon={<CheckIcon size={18}/>}>
            Save
        </Button>
    );

    return (
        <>
            <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-subtle bg-surface pt-[env(safe-area-inset-top)] sm:mx-0 sm:mb-6 sm:rounded-2xl sm:border sm:bg-surface/95 sm:shadow-card sm:backdrop-blur-md">
                <div className="flex min-h-14 items-center gap-1 px-1 sm:min-h-16 sm:gap-2 sm:px-2">
                    {back ? (
                        <Link to={back.to} onClick={handleBackClick} aria-label={`Back to ${back.label}`} className="icon-btn">
                            <ChevronLeftIcon size={22}/>
                        </Link>
                    ) : (
                        <span className="w-3"/>
                    )}
                    <div className="min-w-0 flex-1">
                        {title && <h1 className="truncate text-title-3 text-fg sm:text-title-2">{title}</h1>}
                        {subtitle && <p className="truncate text-caption text-subtle sm:text-body-sm">{subtitle}</p>}
                    </div>
                    {onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={saving}
                            title={deleteLabel}
                            aria-label={deleteLabel}
                            className="icon-btn text-muted hover:bg-danger-soft hover:text-danger"
                        >
                            <TrashIcon size={20}/>
                        </button>
                    )}
                    <div className="hidden sm:block">{saveButton(false)}</div>
                </div>
            </header>

            {/* Phones: Save where the thumb is. The tab bar steps aside on form pages. */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-subtle bg-surface/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md sm:hidden">
                {!online && (
                    <p role="status" className="mb-2 flex items-center justify-center gap-2 text-body-sm font-medium text-muted">
                        <WifiOffIcon size={16}/> You're offline. Connect to save.
                    </p>
                )}
                {saveButton(true)}
            </div>
            {!online && (
                <p role="status" className="mb-4 hidden items-center gap-2 text-body-sm font-medium text-muted sm:flex">
                    <WifiOffIcon size={16}/> You're offline. Connect to save.
                </p>
            )}

            <ConfirmDialog
                open={confirmExit}
                variant="neutral"
                title="Changes will not be saved"
                message="You have unsaved changes. Are you sure you want to exit without saving?"
                confirmLabel="Exit"
                onConfirm={handleExit}
                onCancel={() => setConfirmExit(false)}
            />
        </>
    );
}
