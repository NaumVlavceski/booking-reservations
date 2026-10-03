import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "https://localhost:8080";

export default function CalendarSyncLink({ token }: { token: string }) {
    const [copied, setCopied] = useState(false);
    const feedUrl = `${API_BASE}/api/ical/${token}.ics`;

    async function handleCopy() {
        await navigator.clipboard.writeText(feedUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="bg-slate-50 border rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Calendar sync link</p>
            <p className="text-xs text-gray-600 mb-3">
                Paste this link into Airbnb or Booking.com's calendar sync settings to
                automatically block these dates on those platforms.
            </p>
            <div className="flex gap-2">
                <input
                    readOnly
                    value={feedUrl}
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 text-xs font-mono bg-white border rounded px-3 py-2 text-gray-700"
                />
                <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-teal-700"
                >
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
        </div>
    );
}