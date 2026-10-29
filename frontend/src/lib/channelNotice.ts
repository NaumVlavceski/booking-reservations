import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {meQuery} from "./api/me";

const KEY_PREFIX = "roomtrack.channelNotice.understood.";

function read(email: string): boolean {
    try {
        return localStorage.getItem(KEY_PREFIX + email.toLowerCase()) !== null;
    } catch {
        return false;
    }
}

/**
 * Whether this account has already confirmed "I understand" on the Booking.com sync notes (on this device),
 * so they're only shown before its first connection.
 */
export function useChannelNotice(): { understood: boolean; markUnderstood: () => void } {
    const {data: me} = useQuery(meQuery);
    const [justUnderstood, setJustUnderstood] = useState(false);
    // Until we know who's signed in, assume it hasn't been seen: showing it once too often beats skipping it.
    const understood = justUnderstood || (me ? read(me.email) : false);

    function markUnderstood() {
        setJustUnderstood(true);
        if (!me) return;
        try {
            localStorage.setItem(KEY_PREFIX + me.email.toLowerCase(), "1");
        } catch {
            // Storage unavailable (private mode): the notes may show again next time, nothing breaks.
        }
    }

    return {understood, markUnderstood};
}
