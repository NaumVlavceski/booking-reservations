import {useEffect, useRef, useState} from "react";
import {Link, Navigate, useLocation, useNavigate} from "react-router-dom";
import {useMutation} from "@tanstack/react-query";
import {resendCode, verifyEmail} from "../lib/api/auth";
import {apiErrorMessage} from "../lib/api/client";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {ONBOARDING_PATH} from "../lib/onboarding";
import {useToast} from "../lib/toast";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import Spinner from "../components/ui/Spinner";
import CodeInput, {CODE_LENGTH, type CodeInputHandle} from "../components/CodeInput";

const RESEND_SECONDS = 60;

interface VerifyState {
    email?: string;
    /** Set after sign-up, so the new owner lands straight in the guided setup. */
    welcome?: boolean;
}

export default function VerifyEmailPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const state = (useLocation().state ?? {}) as VerifyState;
    const email = state.email;

    const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
    const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS); // a code was just sent
    const codeInput = useRef<CodeInputHandle>(null);

    useEffect(() => {
        if (secondsLeft <= 0) return;
        const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [secondsLeft]);

    const verifyMutation = useMutation({
        mutationFn: verifyEmail,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            navigate(state.welcome ? ONBOARDING_PATH : "/dashboard/calendar", {replace: true});
        },
        onError: () => {
            // Start over with empty boxes and the cursor in the first one
            setDigits(Array(CODE_LENGTH).fill(""));
            codeInput.current?.focus();
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
                    <CodeInput
                        ref={codeInput}
                        digits={digits}
                        onChange={update}
                        label="Verification code"
                        invalid={verifyMutation.isError}
                        disabled={verifyMutation.isPending}
                        autoFocus
                    />

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
