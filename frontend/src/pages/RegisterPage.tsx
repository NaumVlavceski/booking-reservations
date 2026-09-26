import {Link, useNavigate} from "react-router-dom";
import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {register} from "../lib/api/auth.ts";
import {tokenStorage} from "../lib/auth/tokenStorage.ts";
import AppLogo from "../components/AppLogo";

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
            // A brand-new account has nothing to show yet — set up the first property first.
            navigate("/dashboard/properties/new?welcome=1", {replace: true});
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
        <div className="flex min-h-screen items-center justify-center px-5 py-10">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md space-y-5 sm:rounded-3xl sm:border sm:border-slate-200 sm:bg-white sm:p-10 sm:shadow-sm"
            >
                <div className="mb-8 flex flex-col items-center gap-3 text-center">
                    <AppLogo />
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Create your account</h1>
                        <p className="mt-1 text-sm text-slate-500">Start managing your rentals in minutes</p>
                    </div>
                </div>

                <div>
                    <label className="field-label" htmlFor="businessName">Business name</label>
                    <input id="businessName" name="businessName" value={form.businessName}
                           onChange={handleChange} required autoComplete="organization" className="field-input"/>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
                    <div>
                        <label className="field-label" htmlFor="fullName">Full name</label>
                        <input id="fullName" name="fullName" value={form.fullName}
                               onChange={handleChange} required autoComplete="name" className="field-input"/>
                    </div>
                    <div>
                        <label className="field-label" htmlFor="contactPhone">Contact phone</label>
                        <input id="contactPhone" name="contactPhone" type="tel" value={form.contactPhone}
                               onChange={handleChange} required autoComplete="tel" className="field-input"/>
                    </div>
                </div>

                <div>
                    <label className="field-label" htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" value={form.email}
                           onChange={handleChange} required autoComplete="email" className="field-input"/>
                </div>

                <div>
                    <label className="field-label" htmlFor="password">Password</label>
                    <input id="password" name="password" type="password" value={form.password}
                           onChange={handleChange} required autoComplete="new-password" className="field-input"/>
                </div>

                {mutation.isError && (
                    <p className="alert-error">Registration failed. Check your details and try again.</p>
                )}

                <button type="submit" disabled={mutation.isPending} className="btn btn-primary w-full py-3">
                    {mutation.isPending ? "Creating account..." : "Create account"}
                </button>

                <p className="text-center text-sm text-slate-500">
                    Already have an account? <Link to="/login" className="font-semibold text-teal-700">Log in</Link>
                </p>
            </form>
        </div>
    );
}
