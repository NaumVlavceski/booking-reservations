import type {MouseEvent} from "react";
import {Link} from "react-router-dom";
import {CheckIcon, ChevronLeftIcon, TrashIcon} from "./icons";

interface FormTopBarProps {
    /** id of the <form> to submit — Save sits outside it, so it targets it via form="…". */
    formId: string;
    saving: boolean;
    back?: { to: string; label: string; onClick?: (e: MouseEvent) => void };
    /** Shows a delete button next to Save (edit mode). */
    onDelete?: () => void;
    deleteLabel?: string;
}

/** Top bar for edit forms: back link left; delete + Save right. Pinned while scrolling. */
export default function FormTopBar({formId, saving, back, onDelete, deleteLabel = "Delete"}: FormTopBarProps) {
    return (
        <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:bg-slate-100/95 sm:px-0">
            {back ? (
                <Link to={back.to} onClick={back.onClick} className="back-link mb-0 min-w-0">
                    <ChevronLeftIcon className="shrink-0"/>
                    {/*<span className="truncate">{back.label}</span>*/}
                </Link>
            ) : (
                <span/>
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
        </div>
    );
}
