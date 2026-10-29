import {Link} from "react-router-dom";
import {useFromHere} from "../lib/useReturnTo";
import {ChevronRightIcon, HelpIcon} from "./icons";

export default function ChannelGuideLink() {
    const fromHere = useFromHere();
    return (
        <Link
            to="/dashboard/help/connect-calendars"
            state={fromHere}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-primary-line bg-primary-soft px-4 py-3 text-body-sm font-semibold text-on-primary-soft transition-colors hover:border-primary"
        >
            <HelpIcon size={20} className="shrink-0"/>
            <span className="min-w-0 flex-1">Step-by-step guide: connect Booking.com</span>
            <ChevronRightIcon size={18} className="shrink-0"/>
        </Link>
    );
}
