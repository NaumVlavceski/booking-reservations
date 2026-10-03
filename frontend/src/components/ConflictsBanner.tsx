import {getOpenConflicts} from "../lib/api/conflicts.ts";
import {useQuery} from "@tanstack/react-query";
import {Link} from "react-router-dom";

export default function ConflictsBanner(){
    const { data: conflicts } = useQuery({
        queryKey: ["conflicts"],
        queryFn: getOpenConflicts,
        refetchInterval: 60_000, // catch new conflicts without a manual refresh
    });

    if (!conflicts || conflicts.length === 0) return null;
    return (
        <Link
            to="/dashboard/conflicts"
            className="block bg-red-50 border-b border-red-200 text-red-800 text-sm px-6 py-2.5 hover:bg-red-100"
        >
            <strong>{conflicts.length}</strong> booking {conflicts.length === 1 ? "conflict needs" : "conflicts need"} your attention — a channel reported dates that overlap an existing reservation.
        </Link>
    );
}
