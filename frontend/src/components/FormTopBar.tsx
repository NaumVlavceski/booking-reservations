import type {MouseEvent} from "react";
import {useState} from "react";
import {Link} from "react-router-dom";
import {CheckIcon, ChevronLeftIcon, TrashIcon, WifiOffIcon} from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import Button from "./ui/Button";
import {useOnlineStatus} from "../lib/useOnlineStatus";
import {useReturnTo} from "../lib/useReturnTo";

interface FormTopBarProps {
    /** id of the <form> to submit — Save sits outside it, so it targets it via form="…". */
    formId: string;
    saving: boolean;
    /**
     * Back button. It returns to the page you came from; `to` is only where it goes when this page was
     * opened directly. `onClick` replaces that behaviour entirely.
     */
    back?: { to: string; onClick?: (e: MouseEvent) => void };
    /** Shows a bin button in the top-right corner (edit mode): delete, or cancel for a booking. */
    onDelete?: () => void;
    deleteLabel?: string;
    /** The page's heading, centred, e.g. "Edit Room 1". */
    title?: string;
    /** Second line under the title, e.g. the property a room belongs to. */
    subtitle?: string;
    /** When true, leaving via `back` first asks to confirm — used once the form has unsaved changes. */
    isDirty?: boolean;
}

/**
 * Header for forms: back (top left), centred title, bin (top right). Save sits in a bar pinned to the
 * bottom of the screen, where the thumb is on a phone.
 */
export default function FormTopBar({formId, saving, back, onDelete, deleteLabel = "Delete", title, subtitle, isDirty = false}: FormTopBarProps) {
    const online = useOnlineStatus();
    const {goBack} = useReturnTo(back?.to ?? "/dashboard/calendar");
    const [confirmExit, setConfirmExit] = useState(false);

    function leave(e: MouseEvent) {
        if (back?.onClick) back.onClick(e);
        else {
            e.preventDefault();
            goBack();
        }
    }

    function handleBackClick(e: MouseEvent) {
        if (isDirty) {
            e.preventDefault();
            setConfirmExit(true);
        } else {
            leave(e);
        }
    }

    function handleExit() {
        setConfirmExit(false);
        leave({preventDefault: () => {}} as MouseEvent);
    }

    return (
        <>
            <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-subtle bg-surface pt-[env(safe-area-inset-top)] sm:mx-0 sm:mb-6 sm:rounded-2xl sm:border sm:bg-surface/95 sm:shadow-card sm:backdrop-blur-md">
                <div className="grid min-h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center px-1 sm:min-h-16 sm:px-2">
                    {back ? (
                        <Link to={back.to} onClick={handleBackClick} aria-label="Back" className="icon-btn">
                            <ChevronLeftIcon size={22}/>
                        </Link>
                    ) : (
                        <span/>
                    )}
                    <div className="min-w-0 text-center">
                        {title && <h1 className="truncate text-title-3 text-fg sm:text-title-2">{title}</h1>}
                        {subtitle && <p className="truncate text-caption text-subtle sm:text-body-sm">{subtitle}</p>}
                    </div>
                    {onDelete ? (
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={saving}
                            title={deleteLabel}
                            aria-label={deleteLabel}
                            className="icon-btn justify-self-end text-danger hover:bg-danger-soft"
                        >
                            <TrashIcon size={20}/>
                        </button>
                    ) : (
                        <span/>
                    )}
                </div>
            </header>

            {/* Save, pinned to the bottom of the screen (next to the sidebar/rail from sm up). */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-subtle bg-surface/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md sm:left-20 sm:px-6 sm:pb-3 lg:left-64 lg:px-8">
                <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
                    {!online && (
                        <p role="status" className="flex items-center justify-center gap-2 text-body-sm font-medium text-muted">
                            <WifiOffIcon size={16}/> You're offline. Connect to save.
                        </p>
                    )}
                    <Button type="submit" form={formId} size="lg" loading={saving} loadingLabel="Saving..."
                            disabled={!online} icon={<CheckIcon size={18}/>} className="w-full sm:w-auto sm:min-w-40">
                        Save
                    </Button>
                </div>
            </div>

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
