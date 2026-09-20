import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../lib/api/auth";
import { tokenStorage } from "../lib/auth/tokenStorage";

export default function LoginPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: "", password: "" });

    const mutation = useMutation({
        mutationFn: login,
        onSuccess: (data) => {
            tokenStorage.set(data.token);
            navigate("/dashboard");
        },
    });
    console.log("Mut:",mutation)
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate(form);
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <form
                onSubmit={handleSubmit}
                className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-4"
            >
                <h1 className="text-2xl font-semibold text-gray-900">Log in</h1>

                <input
                    type="email"
                    placeholder="Email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="w-full border rounded px-3 py-2"
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    className="w-full border rounded px-3 py-2"
                />

                {mutation.isError && (
                    <p className="text-red-600 text-sm">Invalid email or password.</p>
                )}

                <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
                >
                    {mutation.isPending ? "Logging in..." : "Log in"}
                </button>

                <p className="text-sm text-gray-600 text-center">
                    Don't have an account? <Link to="/register" className="text-blue-600">Register</Link>
                </p>
            </form>
        </div>
    );
}