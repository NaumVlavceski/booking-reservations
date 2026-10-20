import {apiErrorCode, apiErrorMessage} from "../lib/api/client";
import {useEffect, useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {useNavigate, useLocation, Link, Navigate} from "react-router-dom";
import {login, resendCode} from "../lib/api/auth";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {clearSessionExpired, takeReturnTo, wasSessionExpired} from "../lib/auth/session";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";
import AuthLayout from "../components/AuthLayout";
import {TextField} from "../components/ui/Field";
import PasswordField from "../components/ui/PasswordField";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";

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
    useEffect(() => {
        if (passwordChanged) navigate(location.pathname, {replace: true, state: null});
    }, [passwordChanged, navigate, location.pathname]);

    const mutation = useMutation({
        mutationFn: login,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            navigate(takeReturnTo("/dashboard/calendar"), {replace: true});
        },
        onError: (error) => {
            if (apiErrorCode(error) === "EMAIL_NOT_VERIFIED") {
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
        return <Navigate to="/dashboard/calendar" replace/>;
    }

    return (
        <AuthLayout
            title="Log in"
            subtitle="Manage every booking in one place"
            footer={<p>Don't have an account? <Link to="/register" className="link inline-flex min-h-11 items-center">Register</Link></p>}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {passwordChanged && !mutation.isError && (
                    <Callout tone="success" role="status">Password changed, please sign in.</Callout>
                )}
                {sessionExpired && !passwordChanged && !mutation.isError && (
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
                        {apiErrorMessage(mutation.error, "Invalid email or password.")}
                    </Callout>
                )}

                <Button type="submit" size="lg" block loading={mutation.isPending} loadingLabel="Logging in...">
                    Log in
                </Button>
            </form>
        </AuthLayout>
    );
}
