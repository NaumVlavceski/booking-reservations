import ConfirmDialog from "./ConfirmDialog";
import {PLATFORM_NAME} from "../lib/syncErrors";

interface RestoreAsDirectDialogProps {
    open: boolean;
    /** The booking's channel, e.g. "BOOKING" */
    source: string;
    pending?: boolean;
    error?: string | null;
    onRestoreAsDirect: () => void;
    onKeepCancelled: () => void;
}

/**
 * Owner's decision (2026-11-14): a cancelled channel booking its channel no longer lists would be cancelled again by
 * the next sync if restored as a channel booking. It can only be kept as a Direct booking, which the sync no longer
 * touches. Keep cancelled is the safe choice (focused first): if the guest booked again, that booking comes in by itself.
 */
export default function RestoreAsDirectDialog({
    open, source, pending, error, onRestoreAsDirect, onKeepCancelled,
}: RestoreAsDirectDialogProps) {
    const channel = PLATFORM_NAME[source] ?? source;
    return (
        <ConfirmDialog
            open={open}
            variant="neutral"
            title={`${channel} no longer has this booking`}
            message={<>
                If it stays a {channel} booking, the next sync cancels it again. Restore it as a Direct booking to
                keep it: it stays on your calendar and RoomTrack stops syncing it with {channel}.
                <br/><br/>
                If the guest booked again on {channel}, keep this one cancelled: the new booking comes in by itself.
            </>}
            confirmLabel="Restore as Direct"
            pendingLabel="Restoring…"
            cancelLabel="Keep cancelled"
            pending={pending}
            error={error}
            onConfirm={onRestoreAsDirect}
            onCancel={onKeepCancelled}
        />
    );
}
