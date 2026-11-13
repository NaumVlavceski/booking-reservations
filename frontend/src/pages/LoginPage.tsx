import {errorCode, errorMessage} from "../lib/errors";
import {useEffect, useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {useNavigate, useLocation, Link, Navigate} from "react-router-dom";
import {login, resendCode} from "../lib/api/auth";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {clearSessionExpired, takeReturnTo, wasSessionExpired} from "../lib/auth/session";
import {clearOfflineCalendar} from "../lib/offlineCalendar";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";
import AuthLayout from "../components/AuthLayout";
import {TextField} from "../components/ui/Field";
import PasswordField from "../components/ui/PasswordField";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import LegalLinks from "../components/LegalLinks";
import TryDemo from "../components/TryDemo";
import {DEMO_ENABLED} from "../lib/demo";

const MESSAGES: ValidationMessages = {
    email: {valueMissing: "Enter your email address.", typeMismatch: "Enter an email address like name@example.com."},
    password: {valueMissing: "Enter your password."},
};

export default function LoginPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState({email: "", password: ""});
    const passwordRef = useRef<HTMLInputElement>(null);
    const {errors, validate, recheck} = useInlineValidation(MESSAGES);
    const [sessionExpired] = useState(wasSessionExpired);
    useEffect(clearSessionExpired, []);
    // Set by the forgot-password page; dropped from history once read so a reload doesn't repeat it
    const location = useLocation();
    const [passwordChanged] = useState(() => Boolean((location.state as { passwordChanged?: boolean } | null)?.passwordChanged));
    // Set by the account page after "Delete my account"
    const [accountDeleted] = useState(() => Boolean((location.state as { accountDeleted?: boolean } | null)?.accountDeleted));
    useEffect(() => {
        if (passwordChanged || accountDeleted) navigate(location.pathname, {replace: true, state: null});
    }, [passwordChanged, accountDeleted, navigate, location.pathname]);

    // FE-01: where to go once signed in. Read once (takeReturnTo clears it) and used by both the navigate() below and
    // the "already signed in" redirect, which used to win the race and always went to the calendar.
    const [signedInTo, setSignedInTo] = useState<string | null>(null);
    const mutation = useMutation({
        mutationFn: login,
        onSuccess: (data) => {
            const target = takeReturnTo("/dashboard/calendar");
            setSignedInTo(target);
            tokenStorage.set(data.token);
            // A copy left by another account on this device is never shown to this one.
            clearOfflineCalendar();
            navigate(target, {replace: true});
        },
        onError: (error) => {
            if (errorCode(error) === "EMAIL_NOT_VERIFIED") {
                // Right password, unverified address: send a fresh code (the server enforces its cooldown) and ask for it
                const email = form.email.trim();
                resendCode(email).catch(() => {});
                navigate("/verify-email", {state: {email}});
                return;
            }
            // Start the next attempt with an empty password, cursor already in it.
            setForm((f) => ({...f, password: ""}));
            passwordRef.current?.focus();
        },
    });

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!validate(e.currentTarget)) return;
        mutation.mutate(form);
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm({...form, [e.target.name]: e.target.value});
        recheck(e.target);
    }

    if (tokenStorage.get()) {
        return <Navigate to={signedInTo ?? "/dashboard/calendar"} replace/>;
    }

    return (
        <AuthLayout
            title="Log in"
            subtitle="Manage every booking in one place"
            footer={<>
                <p>Don't have an account? <Link to="/register" className="link inline-flex min-h-11 items-center">Register</Link></p>
                <LegalLinks/>
            </>}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {passwordChanged && !mutation.isError && (
                    <Callout tone="success" role="status">Password changed, please sign in.</Callout>
                )}
                {accountDeleted && !mutation.isError && (
                    <Callout tone="success" role="status">
                        Your account and everything in it were deleted. We sent a confirmation to your email address.
                    </Callout>
                )}
                {sessionExpired && !passwordChanged && !accountDeleted && !mutation.isError && (
                    <Callout tone="info" role="status">Your session expired, please log in again.</Callout>
                )}
                <TextField
                    label="Email"
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoFocus
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                    value={form.email}
                    onChange={handleChange}
                    required
                    error={errors.email}
                />
                <PasswordField
                    label="Password"
                    id="password"
                    name="password"
                    ref={passwordRef}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    value={form.password}
                    onChange={handleChange}
                    required
                    error={errors.password}
                />
                <div className="-mt-3 flex justify-end">
                    {/* What was typed travels in router state, never in the URL */}
                    <Link to="/forgot-password" state={{email: form.email.trim()}}
                          className="link inline-flex min-h-11 items-center text-body-sm">
                        Forgot password?
                    </Link>
                </div>

                {mutation.isError && (
                    <Callout tone="danger" role="alert">
                        {errorMessage(mutation.error, "Couldn't sign in.")}
                    </Callout>
                )}

                <Button type="submit" size="lg" block loading={mutation.isPending} loadingLabel="Logging in...">
                    Log in
                </Button>
            </form>
            {DEMO_ENABLED && <TryDemo className="mt-6"/>}
        </AuthLayout>
    );
}
