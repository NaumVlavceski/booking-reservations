import {useEffect, useRef, useState} from "react";
import {Link, Navigate, useLocation, useNavigate} from "react-router-dom";
import {useMutation} from "@tanstack/react-query";
import {resendCode, verifyEmail} from "../lib/api/auth";
import {apiErrorMessage} from "../lib/api/client";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {useToast} from "../lib/toast";
import AppLogo from "../components/AppLogo";

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

    if (tokenStorage.get()) return <Navigate to="/dashboard/calendar" replace/>;
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
        <div className="flex min-h-screen items-center justify-center px-5 py-10">
            <div
                className="w-full max-w-md space-y-6 sm:rounded-3xl sm:border sm:border-slate-200 sm:bg-white sm:p-10 sm:shadow-sm">
                <div className="flex flex-col items-center gap-3 text-center">
                    <AppLogo/>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Check your email</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            We sent a 6-digit code to <span className="font-semibold break-all text-slate-700">{email}</span>.
                            It expires in 15 minutes.
                        </p>
                    </div>
                </div>

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
                                autoComplete={i === 0 ? "one-time-code" : "off"}
                                autoFocus={i === 0}
                                aria-label={`Digit ${i + 1} of ${LENGTH}`}
                                disabled={verifyMutation.isPending}
                                className={`h-14 w-11 rounded-xl border bg-white text-center text-2xl font-semibold text-slate-900 shadow-xs transition focus:ring-4 focus:outline-none disabled:bg-slate-50 sm:w-12 ${
                                    verifyMutation.isError
                                        ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
                                        : "border-slate-300 focus:border-teal-600 focus:ring-teal-600/15"
                                }`}
                            />
                        ))}
                    </div>

                    <div aria-live="polite" className="mt-4 min-h-6 text-center">
                        {verifyMutation.isPending && <p className="text-sm text-slate-500">Checking...</p>}
                        {verifyMutation.isError && (
                            <p className="alert-error">
                                {apiErrorMessage(verifyMutation.error, "Couldn't verify the code. Check your connection and try again.")}
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-3 text-center text-sm text-slate-500">
                    <button
                        type="button"
                        onClick={() => resendMutation.mutate(email)}
                        disabled={secondsLeft > 0 || resendMutation.isPending}
                        className="btn btn-secondary w-full py-3"
                    >
                        {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : resendMutation.isPending ? "Sending..." : "Resend code"}
                    </button>
                    <p>
                        Wrong address? <Link to="/register" className="font-semibold text-teal-700">Use a different email</Link>
                    </p>
                    <p>
                        Already verified? <Link to="/login" className="font-semibold text-teal-700">Log in</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
