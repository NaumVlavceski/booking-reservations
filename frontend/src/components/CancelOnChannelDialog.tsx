import {useRef} from "react";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import {WarningIcon} from "./icons";
import {PLATFORM_NAME} from "../lib/syncErrors";

interface CancelOnChannelDialogProps {
    open: boolean;
    /** The booking's channel, e.g. "BOOKING" */
    source: string;
    onClose: () => void;
}

/**
 * Owner's decision (2026-11-14, ICAL-01 revisited): a booking its channel still lists is cancelled on the channel, not
 * in RoomTrack. Cancelling it only here would free its dates here and on the other channels (through RoomTrack's
 * calendar link) while the guest still holds them. The server refuses it too (409 CHANNEL_BOOKING).
 */
export default function CancelOnChannelDialog({open, source, onClose}: CancelOnChannelDialogProps) {
    const okRef = useRef<HTMLButtonElement>(null);
    const channel = PLATFORM_NAME[source] ?? source;
    return (
        <Sheet
            open={open}
            onClose={onClose}
            role="alertdialog"
            title={`Cancel it on ${channel}`}
            description={<>
                This booking is still on {channel}. Cancel it there: RoomTrack takes it off the calendar by itself
                within a few minutes.
            </>}
            icon={
                <span className="flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning">
                    <WarningIcon size={20}/>
                </span>
            }
            initialFocusRef={okRef}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button ref={okRef} variant="primary" size="lg"
                            className="sm:min-h-10 sm:rounded-control sm:text-body-sm" onClick={onClose}>
                        OK
                    </Button>
                </div>
            }
        />
    );
}
