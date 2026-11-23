// The admin step-up: opens on the spot (owner app or an expired admin session), emails a code and checks it.
// Lazy-loaded, so owners never download it.
import {useEffect, useRef, useState} from "react";
import axios from "axios";
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import CodeInput, {CODE_LENGTH, type CodeInputHandle} from "../components/CodeInput";
import {ShieldIcon} from "../components/icons";
import {errorCode, errorMessage} from "../lib/errors";
import {requestAdminCode, verifyAdminCode} from "./adminApi";
import {adminSession} from "./adminSession";
import {mmss} from "./adminUi";

const EMPTY = Array.from({length: CODE_LENGTH}, () => "");

function retryAfter(e: unknown): number {
    if (!axios.isAxiosError(e)) return 60;
    const v = Number(e.response?.headers?.["retry-after"]);
    return Number.isFinite(v) && v > 0 ? v : 60;
}

export default function AdminVerifyDialog({open, onClose, onVerified, reason}: {
    open: boolean;
    onClose: () => void;
    onVerified: () => void;
    /** Shown above the code boxes, e.g. "Your admin session ended." */
    reason?: string;
}) {
    const [digits, setDigits] = useState<string[]>(EMPTY);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const inputRef = useRef<CodeInputHandle>(null);
    const requested = useRef(false);

    async function send() {
        setSending(true);
        setError(null);
        try {
            const res = await requestAdminCode();
            if (res.codeRequired === false) {
                // Development backend without mail: no code exists, the panel opens straight away
                const session = await verifyAdminCode("not-needed");
                if (!session.sessionToken) throw new Error("No session");
                adminSession.set({token: session.sessionToken, expiresAt: session.expiresAt, maxExpiresAt: session.maxExpiresAt});
                onVerified();
                return;
            }
            setSentTo(res.sentTo);
            setCooldown(res.resendAfterSeconds);
            setDigits(EMPTY);
            inputRef.current?.focus();
        } catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 429) {
                const wait = retryAfter(e);
                setCooldown(wait);
                setError(wait > 90
                    ? `Too many tries. You can ask for a new code in about ${Math.ceil(wait / 60)} minutes.`
                    : "A code was sent a moment ago. Use that one, or ask for a new one when the timer ends.");
            } else if (axios.isAxiosError(e) && e.response?.status === 404) {
                setUnavailable(true);
            } else {
                setError(errorMessage(e, "The code couldn't be sent."));
            }
        } finally {
            setSending(false);
        }
    }

    // One code per opening of the dialog
    useEffect(() => {
        if (!open) {
            requested.current = false;
            return;
        }
        if (requested.current) return;
        requested.current = true;
        setDigits(EMPTY);
        setSentTo(null);
        setUnavailable(false);
        void send();
    }, [open]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => window.clearTimeout(t);
    }, [cooldown]);

    async function verify() {
        const code = digits.join("");
        if (code.length !== CODE_LENGTH) {
            setError("Enter all 6 digits of the code.");
            return;
        }
        setVerifying(true);
        setError(null);
        try {
            const res = await verifyAdminCode(code);
            if (!res.sessionToken) throw new Error("No session");
            adminSession.set({token: res.sessionToken, expiresAt: res.expiresAt, maxExpiresAt: res.maxExpiresAt});
            setDigits(EMPTY);
            onVerified();
        } catch (e) {
            setDigits(EMPTY);
            inputRef.current?.focus();
            if (axios.isAxiosError(e) && e.response?.status === 429) {
                setError(`Too many wrong codes. The Admin Panel is locked for about ${Math.ceil(retryAfter(e) / 60)} minutes.`);
            } else if (errorCode(e) === "INVALID_CODE") {
                setError("That code is not correct or has expired. Check the code or ask for a new one.");
            } else if (axios.isAxiosError(e) && e.response?.status === 404) {
                setUnavailable(true);
            } else {
                setError(errorMessage(e, "The code couldn't be checked."));
            }
        } finally {
            setVerifying(false);
        }
    }

    return (
        <Sheet
            open={open}
            onClose={onClose}
            dismissible={!verifying}
            title={unavailable ? "Admin Panel not available" : "Check your email"}
            icon={
                <span className="mx-auto flex size-14 items-center justify-center rounded-card bg-primary-soft text-on-primary-soft sm:mx-0">
                    <ShieldIcon size={24}/>
                </span>
            }
            description={unavailable ? "This account can't open the Admin Panel." : (
                <>
                    {reason && <span className="mb-1 block font-semibold text-fg">{reason}</span>}
                    We sent a 6-digit code to <strong className="text-fg">{sentTo ?? "your email"}</strong> to open the Admin Panel.
                </>
            )}
        >
            {unavailable ? (
                <Button variant="secondary" block size="lg" onClick={onClose}>Close</Button>
            ) : (
                <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    void verify();
                }}>
                    <CodeInput ref={inputRef} digits={digits} onChange={(d) => {
                        setDigits(d);
                        setError(null);
                    }} label="Admin code" invalid={Boolean(error)} disabled={verifying} autoFocus/>
                    {error && <Callout tone="danger" role="alert">{error}</Callout>}
                    <Button type="submit" block size="lg" loading={verifying} loadingLabel="Checking…">
                        Verify and open Admin
                    </Button>
                    <p className="text-center text-body-sm text-muted">
                        Didn't get it?{" "}
                        {cooldown > 0 ? (
                            <span className="num font-semibold text-fg">Resend in {mmss(cooldown)}</span>
                        ) : (
                            <button type="button" className="min-h-11 font-semibold text-primary underline-offset-2 hover:underline"
                                    onClick={() => void send()} disabled={sending}>
                                {sending ? "Sending…" : "Send a new code"}
                            </button>
                        )}
                    </p>
                    <p className="text-center text-caption text-subtle">The code expires in 10 minutes and works once.</p>
                    <Button variant="ghost" block onClick={onClose} disabled={verifying}>Cancel</Button>
                </form>
            )}
        </Sheet>
    );
}
