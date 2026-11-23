import {createContext, useContext} from "react";

export interface AdminShell {
    /** Seconds left in the admin session window (re-synced with the server's expiry). */
    secondsLeft: number;
    /** The window length, for the progress bar. */
    windowSeconds: number;
    /** Continue: another 30 minutes, up to the server's cap. */
    extend: () => Promise<void>;
    extending: boolean;
    /** Log out of Admin: ends only the admin session and returns to the owner calendar. */
    logout: () => Promise<void>;
    /** Owners needing help, for the Owners badge. */
    needHelp: number;
}

export const AdminShellContext = createContext<AdminShell>({
    secondsLeft: 0,
    windowSeconds: 1800,
    extend: async () => {},
    extending: false,
    logout: async () => {},
    needHelp: 0,
});

export function useAdminShell(): AdminShell {
    return useContext(AdminShellContext);
}
