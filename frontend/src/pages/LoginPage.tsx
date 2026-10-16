import {apiErrorCode, apiErrorMessage} from "../lib/api/client";
import {useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {useNavigate, Link, Navigate} from "react-router-dom";
import {login, resendCode} from "../lib/api/auth";
import {tokenStorage} from "../lib/auth/tokenStorage";
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

    const mutation = useMutation({
        mutationFn: login,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            navigate("/dashboard/calendar", {replace: true});
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
