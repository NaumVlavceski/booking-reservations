import {useEffect, useRef, useState} from "react";
import {Link, Navigate, useLocation, useNavigate} from "react-router-dom";
import {useMutation} from "@tanstack/react-query";
import {forgotPassword, resetPassword, verifyResetCode} from "../lib/api/auth";
import {errorCode, errorMessage} from "../lib/errors";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";
import {useToast} from "../lib/toast";
import AuthLayout from "../components/AuthLayout";
import CodeInput, {CODE_LENGTH, type CodeInputHandle} from "../components/CodeInput";
import {TextField} from "../components/ui/Field";
import PasswordField from "../components/ui/PasswordField";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import Spinner from "../components/ui/Spinner";

const RESEND_SECONDS = 60;
/** The server kills a code after this many wrong guesses (it doesn't say so, to not reveal which addresses exist). */
const MAX_ATTEMPTS = 5;
const REDIRECT_MS = 2000;

type Step = "email" | "code" | "password";

const STEPS: Record<Step, { number: number; title: string }> = {
    email: {number: 1, title: "Reset your password"},
    code: {number: 2, title: "Enter the code"},
    password: {number: 3, title: "Choose a new password"},
};

const MESSAGES: ValidationMessages = {
    email: {valueMissing: "Enter your email address.", typeMismatch: "Enter an email address like name@example.com."},
    newPassword: {
        valueMissing: "Choose a new password.",
        tooShort: "Use at least 8 characters.",
        tooLong: "Use 72 characters or fewer.",
    },
    confirmPassword: {valueMissing: "Enter the new password again."},
};

const emptyCode = () => Array<string>(CODE_LENGTH).fill("");

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const toast = useToast();
    // The login page may hand over what was typed there (router state, never the URL)
    const initialEmail = ((useLocation().state ?? {}) as { email?: string }).email ?? "";

    const [step, setStep] = useState<Step>("email");
    const [email, setEmail] = useState(initialEmail);
    const [digits, setDigits] = useState<string[]>(emptyCode);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState(0);
    // Memory only: never localStorage, sessionStorage or the URL
    const [resetToken, setResetToken] = useState<string | null>(null);
    const [passwords, setPasswords] = useState({newPassword: "", confirmPassword: ""});
    const [done, setDone] = useState(false);

    const emailRef = useRef<HTMLInputElement>(null);
    const codeInput = useRef<CodeInputHandle>(null);
    const newPasswordRef = useRef<HTMLInputElement>(null);
    const confirmRef = useRef<HTMLInputElement>(null);
    const {errors, validate, recheck, setError} = useInlineValidation(MESSAGES);

    const locked = failedAttempts >= MAX_ATTEMPTS;

    // Each step starts with the cursor in its first field
    useEffect(() => {
        if (step === "email") emailRef.current?.focus();
        else if (step === "code") codeInput.current?.focus();
        else newPasswordRef.current?.focus();
    }, [step]);

    useEffect(() => {
        if (secondsLeft <= 0) return;
        const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [secondsLeft]);

    useEffect(() => {
        if (!done) return;
        const timer = setTimeout(() => navigate("/login", {replace: true, state: {passwordChanged: true}}), REDIRECT_MS);
        return () => clearTimeout(timer);
    }, [done, navigate]);

    function startCodeStep() {
        setDigits(emptyCode());
        setFailedAttempts(0);
        setSecondsLeft(RESEND_SECONDS);
        verifyMutation.reset();
    }

    const sendMutation = useMutation({
        mutationFn: forgotPassword,
        onSuccess: () => {
            startCodeStep();
            setStep("code");
        },
    });

    const resendMutation = useMutation({
        mutationFn: forgotPassword,
        onSuccess: () => {
            startCodeStep();
            toast.show("If an account with this email exists, we sent a new code.");
            codeInput.current?.focus();
        },
        onError: (error) => {
            toast.show(errorMessage(error, "Couldn't send a new code."), {tone: "error"});
        },
    });

    const verifyMutation = useMutation({
        mutationFn: verifyResetCode,
        onSuccess: (token) => {
            setResetToken(token);
            setPasswords({newPassword: "", confirmPassword: ""});
            resetMutation.reset();
            setStep("password");
        },
        onError: (error) => {
            if (errorCode(error) === "INVALID_CODE") setFailedAttempts((n) => n + 1);
            // Start over with empty boxes and the cursor in the first one
            setDigits(emptyCode());
            codeInput.current?.focus();
        },
    });

    const resetMutation = useMutation({
        mutationFn: resetPassword,
        onSuccess: () => {
            setResetToken(null);
            setDone(true);
        },
    });

    if (tokenStorage.get() && !done) return <Navigate to="/dashboard/calendar" replace/>;

    function submitCode(code: string[]) {
        if (verifyMutation.isPending || locked || code.some((d) => d === "")) return;
        verifyMutation.mutate({email, code: code.join("")});
    }

    function handleDigits(next: string[]) {
        setDigits(next);
        if (verifyMutation.isError) verifyMutation.reset();
        // A full code (typed or pasted) goes straight off; the Verify button is there too
        if (next.every((d) => d !== "")) submitCode(next);
    }

    function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (sendMutation.isPending || !validate(e.currentTarget)) return;
        const trimmed = email.trim();
        setEmail(trimmed);
        sendMutation.mutate(trimmed);
    }

    function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        submitCode(digits);
    }

    function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (resetMutation.isPending || !resetToken || !validate(e.currentTarget)) return;
        if (passwords.newPassword !== passwords.confirmPassword) {
            setError("confirmPassword", "The passwords don't match.");
            confirmRef.current?.focus();
            return;
        }
        resetMutation.mutate({resetToken, newPassword: passwords.newPassword});
    }

    function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
        const next = {...passwords, [e.target.name]: e.target.value};
        setPasswords(next);
        recheck(e.target);
        // Clear the mismatch note as soon as the two agree
        if (errors.confirmPassword && next.newPassword === next.confirmPassword) setError("confirmPassword", null);
    }

    function chooseDifferentEmail() {
        sendMutation.reset();
        verifyMutation.reset();
        setStep("email");
    }

    function startAgain() {
        setResetToken(null);
        sendMutation.reset();
        setStep("email");
    }

    const {number, title} = STEPS[step];

    return (
        <AuthLayout
            title={done ? "Password changed" : title}
            subtitle={done ? "You can now log in with your new password." : <span className="num">Step {number} of 3</span>}
            footer={<p>Remembered it? <Link to="/login" className="link inline-flex min-h-11 items-center">Log in</Link></p>}
        >
            {done ? (
                <div className="space-y-5">
                    <Callout tone="success" role="status" title="Your password has been changed">
                        You've been signed out everywhere. Taking you to log in...
                    </Callout>
                    <Link to="/login" replace state={{passwordChanged: true}} className="link inline-flex min-h-11 items-center">
                        Go to log in now
                    </Link>
                </div>
            ) : step === "email" ? (
                <form onSubmit={handleEmailSubmit} noValidate className="space-y-5">
                    <p className="text-body-sm text-muted">
                        Enter the email you use for RoomTrack and we'll send you a 6-digit code.
                    </p>
                    <TextField
                        label="Email"
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        ref={emailRef}
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="send"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            recheck(e.target);
                        }}
                        required
                        error={errors.email}
                    />

                    {sendMutation.isError && (
                        <Callout tone="danger" role="alert">
                            {errorMessage(sendMutation.error, "Couldn't send the code.")}
                        </Callout>
                    )}

                    <Button type="submit" size="lg" block loading={sendMutation.isPending} loadingLabel="Sending...">
                        Send code
                    </Button>
                </form>
            ) : step === "code" ? (
                <form onSubmit={handleCodeSubmit} noValidate className="space-y-6">
                    <Callout tone="info" role="status">
                        If an account with this email exists, we sent a code to{" "}
                        <span className="font-semibold [overflow-wrap:anywhere]">{email}</span>. It expires in 10 minutes.
                    </Callout>

                    <div>
                        <CodeInput
                            ref={codeInput}
                            digits={digits}
                            onChange={handleDigits}
                            label="Reset code"
                            invalid={verifyMutation.isError || locked}
                            disabled={verifyMutation.isPending || locked}
                        />

                        <div aria-live="polite" className="mt-4 min-h-6 text-center">
                            {verifyMutation.isPending && (
                                <p className="inline-flex items-center gap-2 text-body-sm text-muted"><Spinner size={16}/>Checking...</p>
                            )}
                            {locked ? (
                                <Callout tone="danger" className="text-left">
                                    Too many wrong attempts. Request a new code.
                                </Callout>
                            ) : verifyMutation.isError && (
                                <Callout tone="danger" className="text-left">
                                    {errorCode(verifyMutation.error) === "INVALID_CODE"
                                        ? "Invalid or expired code. Check the email and try again, or request a new code."
                                        : errorMessage(verifyMutation.error, "Couldn't check the code.")}
                                </Callout>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Button
                            type="submit"
                            size="lg"
                            block
                            disabled={locked || digits.some((d) => d === "")}
                            loading={verifyMutation.isPending}
                            loadingLabel="Checking..."
                        >
                            Verify
                        </Button>
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

                    <p className="text-center text-body-sm text-muted">
                        Wrong address?{" "}
                        <button type="button" onClick={chooseDifferentEmail} className="link inline-flex min-h-11 items-center">
                            Use a different email
                        </button>
                    </p>
                </form>
            ) : (
                <form onSubmit={handlePasswordSubmit} noValidate className="space-y-5">
                    {/* Lets password managers save the new password against the right account */}
                    <input type="email" autoComplete="username" value={email} readOnly hidden/>
                    <PasswordField
                        label="New password"
                        id="newPassword"
                        name="newPassword"
                        ref={newPasswordRef}
                        value={passwords.newPassword}
                        onChange={handlePasswordChange}
                        required
                        minLength={8}
                        maxLength={72}
                        autoComplete="new-password"
                        enterKeyHint="next"
                        hint="At least 8 characters."
                        error={errors.newPassword}
                    />
                    <PasswordField
                        label="Confirm new password"
                        id="confirmPassword"
                        name="confirmPassword"
                        ref={confirmRef}
                        value={passwords.confirmPassword}
                        onChange={handlePasswordChange}
                        required
                        maxLength={72}
                        autoComplete="new-password"
                        enterKeyHint="go"
                        error={errors.confirmPassword}
                    />

                    {resetMutation.isError && (
                        errorCode(resetMutation.error) === "RESET_TOKEN_INVALID" ? (
                            <Callout
                                tone="danger"
                                role="alert"
                                action={<Button variant="secondary" size="sm" onClick={startAgain}>Start again</Button>}
                            >
                                {errorMessage(resetMutation.error, "This password reset has expired. Please start again.")}
                            </Callout>
                        ) : (
                            <Callout tone="danger" role="alert">
                                {errorMessage(resetMutation.error, "Couldn't change the password.")}
                            </Callout>
                        )
                    )}

                    <Button type="submit" size="lg" block loading={resetMutation.isPending} loadingLabel="Saving...">
                        Change password
                    </Button>
                </form>
            )}
        </AuthLayout>
    );
}
