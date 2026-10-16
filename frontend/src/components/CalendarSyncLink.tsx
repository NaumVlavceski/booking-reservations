import {useState} from "react";
import {CheckIcon, CopyIcon, LinkIcon} from "./icons";
import Card from "./ui/Card";
import Button from "./ui/Button";

export default function CalendarSyncLink({token}: { token: string }) {
    const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
    const feedUrl = `${window.location.origin}/api/ical/${token}.ics`;

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
        <Card as="section" aria-labelledby={`feed-title-${token}`} className="space-y-3">
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-on-primary-soft">
                    <LinkIcon size={20}/>
                </span>
                <div className="min-w-0">
                    <h2 id={`feed-title-${token}`} className="text-title-3 text-fg">Send your bookings to other channels</h2>
                    <p className="mt-0.5 text-body-sm text-muted">
                        Paste this link into Booking.com's or Airbnb's calendar sync settings. Dates you book here then get
                        blocked there automatically.
                    </p>
                </div>
            </div>
            <div className="flex gap-2">
                <div className="float-field is-floated min-w-0 flex-1 [--field-bg:var(--rt-surface-sunken)]">
                    <input
                        id={`feed-${token}`}
                        readOnly
                        value={feedUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="field-input bg-surface-sunken font-mono"
                    />
                    <label className="float-label" htmlFor={`feed-${token}`}>Calendar link</label>
                </div>
                <Button variant={copyState === "copied" ? "secondary" : "primary"} onClick={handleCopy} className="min-h-12 shrink-0"
                        icon={copyState === "copied" ? <CheckIcon size={18}/> : <CopyIcon size={18}/>}>
                    <span aria-live="polite">{copyState === "copied" ? "Copied!" : "Copy"}</span>
                </Button>
            </div>
            {copyState === "failed" && (
                <p role="alert" className="field-error mt-0">Couldn't copy automatically — select the link and copy it.</p>
            )}
        </Card>
    );
}
