import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFailingCalendars } from "../lib/api/calendars";

export default function SyncHealthBanner() {
    const { data: failing } = useQuery({
        queryKey: ["calendars", "health"],
        queryFn: getFailingCalendars,
        refetchInterval: 60_000,
    });

    if (!failing || failing.length === 0) return null;

    return (
        <Link
            to="/dashboard/sync-health"
            className="block bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-6 py-2.5 hover:bg-amber-100"
        >
            <strong>{failing.length}</strong> calendar {failing.length === 1 ? "sync is" : "syncs are"} failing — a connected channel isn't updating.
        </Link>
    );
}