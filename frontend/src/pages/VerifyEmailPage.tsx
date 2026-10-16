import {useEffect, useRef, useState} from "react";
import {Link, Navigate, useLocation, useNavigate} from "react-router-dom";
import {useMutation} from "@tanstack/react-query";
import {resendCode, verifyEmail} from "../lib/api/auth";
import {apiErrorMessage} from "../lib/api/client";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {useToast} from "../lib/toast";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import Spinner from "../components/ui/Spinner";

const LENGTH = 6;
const RESEND_SECONDS = 60;

interface VerifyState {
    email?: string;
    /** Set after sign-up, so the new owner lands on "add your first property". */
    welcome?: boolean;
}

export default function VerifyEmailPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const state = (useLocation().state ?? {}) as VerifyState;
    const email = state.email;

    const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
    const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS); // a code was just sent
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (secondsLeft <= 0) return;
        const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [secondsLeft]);

    const verifyMutation = useMutation({
        mutationFn: verifyEmail,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            navigate(state.welcome ? "/dashboard/properties/new?welcome=1" : "/dashboard/calendar", {replace: true});
        },
        onError: () => {
            // Start over with empty boxes and the cursor in the first one
            setDigits(Array(LENGTH).fill(""));
            inputs.current[0]?.focus();
        },
    });

    const resendMutation = useMutation({
        mutationFn: resendCode,
        onSuccess: () => {
            setSecondsLeft(RESEND_SECONDS);
            verifyMutation.reset();
            toast.show("If your address needs verification, a new code is on its way.");
        },
        onError: (error) => {
            toast.show(apiErrorMessage(error, "Couldn't send a new code right now. Try again in a moment."), {tone: "error"});
        },
    });

    if (tokenStorage.get() && !verifyMutation.isSuccess) return <Navigate to="/dashboard/calendar" replace/>;
    if (!email) return <Navigate to="/login" replace/>;

    function update(next: string[]) {
        setDigits(next);
        if (verifyMutation.isError) verifyMutation.reset();
        if (next.every((d) => d !== "") && !verifyMutation.isPending) {
            verifyMutation.mutate({email: email!, code: next.join("")});
        }
    }

    function handleChange(index: number, value: string) {
        const typed = value.replace(/\D/g, "");
        if (typed === "") {
            update(digits.map((d, i) => (i === index ? "" : d)));
            return;
        }
        // Typing over a filled box, or a keyboard that sends several digits at once, spills forward
        const next = [...digits];
        let pos = index;
        for (const ch of typed) {
            if (pos >= LENGTH) break;
            next[pos++] = ch;
        }
        update(next);
        inputs.current[Math.min(pos, LENGTH - 1)]?.focus();
    }

    function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Backspace" && digits[index] === "" && index > 0) {
            e.preventDefault();
            update(digits.map((d, i) => (i === index - 1 ? "" : d)));
            inputs.current[index - 1]?.focus();
        } else if (e.key === "ArrowLeft" && index > 0) {
            inputs.current[index - 1]?.focus();
        } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
            inputs.current[index + 1]?.focus();
        }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
        if (!pasted) return;
        e.preventDefault();
        const next = Array.from({length: LENGTH}, (_, i) => pasted[i] ?? "");
        update(next);
        inputs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
    }

    return (
        <AuthLayout
            title="Check your email"
            subtitle={
                <>
                    We sent a 6-digit code to <span className="font-semibold text-fg [overflow-wrap:anywhere]">{email}</span>.
                    It expires in 15 minutes.
                </>
            }
            footer={
                <>
                    <p>Wrong address? <Link to="/register" className="link inline-flex min-h-11 items-center">Use a different email</Link></p>
                    <p>Already verified? <Link to="/login" className="link inline-flex min-h-11 items-center">Log in</Link></p>
                </>
            }
        >
            <div className="space-y-6">
                <div>
                    <div role="group" aria-label="Verification code" className="flex justify-center gap-2 sm:gap-3">
                        {digits.map((digit, i) => (
                            <input
                                key={i}
                                ref={(el) => {
                                    inputs.current[i] = el;
                                }}
                                value={digit}
                                onChange={(e) => handleChange(i, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(i, e)}
                                onPaste={handlePaste}
                                onFocus={(e) => e.target.select()}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoComplete={i === 0 ? "one-time-code" : "off"}
                                autoFocus={i === 0}
                                aria-label={`Digit ${i + 1} of ${LENGTH}`}
                                aria-invalid={verifyMutation.isError || undefined}
                                disabled={verifyMutation.isPending}
                                className={`num h-14 w-11 min-w-0 rounded-xl border bg-surface text-center text-2xl font-semibold text-fg transition-[border-color,box-shadow] focus:ring-3 focus:outline-none disabled:bg-surface-sunken disabled:text-muted sm:w-12 ${
                                    verifyMutation.isError
                                        ? "border-danger ring-1 ring-danger focus:ring-danger/30"
                                        : "border-strong focus:border-primary focus:ring-focus/30"
                                }`}
                            />
                        ))}
                    </div>

                    <div aria-live="polite" className="mt-4 min-h-6 text-center">
                        {verifyMutation.isPending && (
                            <p className="inline-flex items-center gap-2 text-body-sm text-muted"><Spinner size={16}/>Checking...</p>
                        )}
                        {verifyMutation.isError && (
                            <Callout tone="danger" className="text-left">
                                {apiErrorMessage(verifyMutation.error, "Couldn't verify the code. Check your connection and try again.")}
                            </Callout>
                        )}
                    </div>
                </div>

                <Button
                    variant="secondary"
                    size="lg"
                    block
                    onClick={() => resendMutation.mutate(email)}
                    disabled={secondsLeft > 0}
                    loading={resendMutation.isPending}
                    loadingLabel="Sending..."
                >
                    {secondsLeft > 0 ? <span className="num">Resend code in {secondsLeft}s</span> : "Resend code"}
                </Button>
            </div>
        </AuthLayout>
    );
}
