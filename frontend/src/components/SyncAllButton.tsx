// components/SyncAllButton.tsx
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { syncAllCalendars } from "../lib/api/calendars";

const COOLDOWN_MS = 60_000;

export default function SyncAllButton() {
    const queryClient = useQueryClient();
    const [isCoolingDown, setIsCoolingDown] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const syncAllMutation = useMutation({
        mutationFn: syncAllCalendars,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["calendars"] });
            setErrorMessage(null);
        },
        onError: () => {
            setErrorMessage("Couldn't sync — try again in a moment.");
        },
    });

    const handleClick = () => {
        setErrorMessage(null);
        setIsCoolingDown(true);
        syncAllMutation.mutate();
        timeoutRef.current = setTimeout(() => setIsCoolingDown(false), COOLDOWN_MS);
    };

    const isDisabled = isCoolingDown || syncAllMutation.isPending;
    const hasError = !!errorMessage;

    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={handleClick}
                disabled={isDisabled}
                aria-label="Sync all"
                title="Sync all"
                className={`p-2 rounded text-white disabled:opacity-50 ${
                    hasError ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"
                }`}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`w-4 h-4 ${syncAllMutation.isPending ? "animate-spin" : ""}`}
                >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                </svg>
            </button>
            {hasError && (
                <span className="text-xs text-red-600">{errorMessage}</span>
            )}
        </div>
    );
}
