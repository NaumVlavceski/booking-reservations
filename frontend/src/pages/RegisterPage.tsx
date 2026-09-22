import {Link, useNavigate} from "react-router-dom";
import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {register} from "../lib/api/auth.ts";
import {tokenStorage} from "../lib/auth/tokenStorage.ts";

export default function RegisterPage(){
    const navigate = useNavigate();
    const [form,setForm] = useState({
        businessName: "",
        contactPhone: "",
        email: "",
        password: "",
        fullName: "",
    })

    const mutation = useMutation({
        mutationFn: register,
        onSuccess:(data)=>{
            tokenStorage.set(data.token);
            navigate("/dashboard");
        },
    });
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate(form);
    }
    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm({...form,[e.target.name]: e.target.value});
    }
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <form
                onSubmit={handleSubmit}
                className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-4"
            >
                <h1 className="text-2xl font-semibold text-gray-900">Create your account</h1>

                <input
                    name="businessName"
                    placeholder="Business name"
                    value={form.businessName}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2"
                />
                <input
                    name="contactPhone"
                    type="tel"
                    placeholder="Business contact phone"
                    value={form.contactPhone}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2"
                />
                <input
                    name="fullName"
                    placeholder="Your full name"
                    value={form.fullName}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2"
                />
                <input
                    name="email"
                    type="email"
                    placeholder="Login email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2"
                />
                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2"
                />

                {mutation.isError && (
                    <p className="text-red-600 text-sm">
                        Registration failed. Check your details and try again.
                    </p>
                )}

                <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
                >
                    {mutation.isPending ? "Creating account..." : "Create account"}
                </button>

                <p className="text-sm text-gray-600 text-center">
                    Already have an account? <Link to="/login" className="text-blue-600">Log in</Link>
                </p>
            </form>
        </div>
    );
}