import type {MouseEvent} from "react";
import {useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {CheckIcon, ChevronLeftIcon, TrashIcon} from "./icons";
import ConfirmDialog from "./ConfirmDialog";

interface FormTopBarProps {
    /** id of the <form> to submit — Save sits outside it, so it targets it via form="…". */
    formId: string;
    saving: boolean;
    back?: { to: string; label: string; onClick?: (e: MouseEvent) => void };
    /** Shows a delete button next to Save (edit mode). */
    onDelete?: () => void;
    deleteLabel?: string;
    /** Centered label describing the current action, e.g. "Reservation Room 1", "Edit property". */
    title?: string;
    /** When true, leaving via `back` first asks to confirm — used once the form has unsaved changes. */
    isDirty?: boolean;
}

/** Top bar for edit forms: back link left; delete + Save right. Pinned while scrolling. */
export default function FormTopBar({formId, saving, back, onDelete, deleteLabel = "Delete", title, isDirty = false}: FormTopBarProps) {
    const navigate = useNavigate();
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

    return (
        <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:bg-slate-100/95 sm:px-0 relative">
            {back ? (
                <Link to={back.to} onClick={handleBackClick} className="back-link mb-0 min-w-0">
                    <ChevronLeftIcon className="shrink-0"/>
                    {/*<span className="truncate">{back.label}</span>*/}
                </Link>
            ) : (
                <span/>
            )}
            {title && (
                <span className="pointer-events-none absolute left-1/2 top-1/2 max-w-[45%] -translate-x-1/2 -translate-y-1/2 truncate text-sm font-semibold text-slate-900 sm:max-w-[60%]">
                    {title}
                </span>
            )}
            <div className="flex shrink-0 items-center gap-2">
                {onDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={saving}
                        title={deleteLabel}
                        aria-label={deleteLabel}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                        <TrashIcon size={18}/>
                    </button>
                )}
                <button type="submit" form={formId} disabled={saving} className="btn btn-primary">
                    <CheckIcon size={18}/>
                    {saving ? "Saving..." : "Save"}
                </button>
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
        </div>
    );
}
