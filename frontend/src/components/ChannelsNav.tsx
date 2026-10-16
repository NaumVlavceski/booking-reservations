import {useSyncAlerts} from "../lib/useSyncAlerts";
import {SegmentedNav} from "./ui/Segmented";
import {CountBubble} from "./ui/Badge";

/** Booking conflicts | Sync status — the two pages behind the Channels tab. */
export default function ChannelsNav() {
    const {conflictCount, failingCount} = useSyncAlerts();
    return (
        <div className="mb-4 sm:mb-6">
            <SegmentedNav
                label="Channels"
                items={[
                    {
                        to: "/dashboard/conflicts",
                        label: <>Conflicts{conflictCount > 0 && <span className="sr-only"> ({conflictCount})</span>}</>,
                        trailing: <CountBubble count={conflictCount}/>,
                    },
                    {
                        to: "/dashboard/sync-health",
                        label: <>Sync status{failingCount > 0 && <span className="sr-only"> ({failingCount})</span>}</>,
                        trailing: <CountBubble count={failingCount} tone="warning"/>,
                    },
                ]}
            />
        </div>
    );
}
