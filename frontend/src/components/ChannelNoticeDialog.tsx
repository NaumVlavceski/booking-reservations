import {InfoIcon} from "./icons";
import ChannelSyncNotes from "./ChannelSyncNotes";
import Button from "./ui/Button";
import Sheet from "./ui/Sheet";

interface ChannelNoticeDialogProps {
    open: boolean;
    onUnderstood: () => void;
    onClose: () => void;
}
export default function ChannelNoticeDialog({open, onUnderstood, onClose}: ChannelNoticeDialogProps) {
    return (
        <Sheet
            open={open}
            onClose={onClose}
            role="alertdialog"
            size="md"
            title="Things to know before you start"
            icon={
                <span className="flex size-11 items-center justify-center rounded-full bg-info-soft text-info">
                    <InfoIcon size={20}/>
                </span>
            }
            footer={
                <div className="flex flex-col sm:flex-row sm:justify-end">
                    <Button size="lg" className="sm:min-h-11 sm:rounded-xl sm:text-[0.9375rem]" onClick={onUnderstood}>
                        I understand
                    </Button>
                </div>
            }
        >
            <ChannelSyncNotes/>
        </Sheet>
    );
}
