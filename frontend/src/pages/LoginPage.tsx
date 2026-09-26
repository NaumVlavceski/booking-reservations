import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { login } from "../lib/api/auth";
import { tokenStorage } from "../lib/auth/tokenStorage";
import AppLogo from "../components/AppLogo";

export default function LoginPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: "", password: "" });

    const mutation = useMutation({
        mutationFn: login,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            navigate("/dashboard/calendar", { replace: true });
        },
    });
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate(form);
    }

    if (tokenStorage.get()) {
        return <Navigate to="/dashboard/calendar" replace />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center px-5 py-10">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md space-y-5 sm:rounded-3xl sm:border sm:border-slate-200 sm:bg-white sm:p-10 sm:shadow-sm"
            >
                <div className="mb-8 flex flex-col items-center gap-3 text-center">
                    <AppLogo />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staytrack</h1>
                        <p className="mt-1 text-sm text-slate-500">Manage every booking in one place</p>
                    </div>
                </div>

                <h2 className="hidden text-center text-xl font-bold text-slate-900 sm:block">Log in</h2>

                <div>
                    <label className="field-label" htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        required
                        className="field-input"
                    />
                </div>
                <div>
                    <label className="field-label" htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        required
                        className="field-input"
                    />
                </div>

                {mutation.isError && (
                    <p className="alert-error">Invalid email or password.</p>
                )}

                <button type="submit" disabled={mutation.isPending} className="btn btn-primary w-full py-3">
                    {mutation.isPending ? "Logging in..." : "Log in"}
                </button>

                <p className="text-center text-sm text-slate-500">
                    Don't have an account? <Link to="/register" className="font-semibold text-teal-700">Register</Link>
                </p>
            </form>
        </div>
    );
}
