import {useState} from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export default function CalendarSyncLink({token}: { token: string }) {
    const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
    const feedUrl = `${API_BASE}/api/ical/${token}.ics`;

    async function handleCopy() {
        try {
            // navigator.clipboard only exists on HTTPS/localhost.
            await navigator.clipboard.writeText(feedUrl);
            setCopyState("copied");
        } catch {
            setCopyState("failed");
        }
        setTimeout(() => setCopyState("idle"), 2500);
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Send your bookings to other channels</h2>
            <p className="mt-0.5 mb-3 text-sm text-slate-600">
                Paste this link into Booking.com's or Airbnb's calendar sync settings. Dates you book here then get
                blocked there automatically.
            </p>
            <div className="flex gap-2">
                <label className="sr-only" htmlFor={`feed-${token}`}>Calendar link</label>
                <input
                    id={`feed-${token}`}
                    readOnly
                    value={feedUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="field-input min-w-0 flex-1 font-mono sm:text-xs"
                />
                <button type="button" onClick={handleCopy} className="btn btn-primary min-h-11 shrink-0">
                    {copyState === "copied" ? "Copied!" : "Copy"}
                </button>
            </div>
            {copyState === "failed" && (
                <p className="mt-2 text-xs text-red-700">Couldn't copy automatically — select the link and copy it.</p>
            )}
        </section>
    );
}
