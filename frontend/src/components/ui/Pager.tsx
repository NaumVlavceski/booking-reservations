import {ChevronLeftIcon, ChevronRightIcon} from "../icons";
import Button from "./Button";

interface PagerProps {
    /** 0-based. */
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
    /** Names the navigation for screen readers, e.g. "Bookings pages". */
    label: string;
}

/** Previous / "Page 2 of 5" / Next under a paged list. Renders nothing when everything fits on one page. */
export default function Pager({page, totalPages, onChange, label}: PagerProps) {
    if (totalPages <= 1) return null;
    return (
        <nav aria-label={label} className="mt-4 flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => onChange(page - 1)} disabled={page === 0} icon={<ChevronLeftIcon size={16}/>}>
                Previous
            </Button>
            <p className="num text-body-sm text-muted" aria-live="polite">
                Page {page + 1} of {totalPages}
            </p>
            <Button variant="secondary" onClick={() => onChange(page + 1)} disabled={page >= totalPages - 1}>
                Next
                <ChevronRightIcon size={16}/>
            </Button>
        </nav>
    );
}
