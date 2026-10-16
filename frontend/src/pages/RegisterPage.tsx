import {apiErrorMessage} from "../lib/api/client";
import {Link, useNavigate} from "react-router-dom";
import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {register} from "../lib/api/auth.ts";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";
import AuthLayout from "../components/AuthLayout";
import {TextField} from "../components/ui/Field";
import PasswordField from "../components/ui/PasswordField";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";

const MESSAGES: ValidationMessages = {
    businessName: {valueMissing: "Enter the name of your business."},
    fullName: {valueMissing: "Enter your full name."},
    email: {valueMissing: "Enter your email address.", typeMismatch: "Enter an email address like name@example.com."},
    password: {
        valueMissing: "Choose a password.",
        tooShort: "Use at least 8 characters.",
        tooLong: "Use 72 characters or fewer.",
    },
};

export default function RegisterPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        businessName: "",
        contactPhone: "",
        email: "",
        password: "",
        fullName: "",
    });
    const {errors, validate, recheck} = useInlineValidation(MESSAGES);

    const mutation = useMutation({
        mutationFn: register,
        onSuccess: (data) => {
            // No token until the emailed code is entered; a brand-new account then sets up its first property.
            navigate("/verify-email", {replace: true, state: {email: data.email, welcome: true}});
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

    return (
        <AuthLayout
            title="Create your account"
            subtitle="Start managing your rentals in minutes"
            footer={<p>Already have an account? <Link to="/login" className="link inline-flex min-h-11 items-center">Log in</Link></p>}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <TextField label="Business name" id="businessName" name="businessName" value={form.businessName}
                           onChange={handleChange} required autoComplete="organization" enterKeyHint="next"
                           error={errors.businessName}/>

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
                    <TextField label="Full name" id="fullName" name="fullName" value={form.fullName}
                               onChange={handleChange} required autoComplete="name" enterKeyHint="next"
                               error={errors.fullName}/>
                    <TextField label="Contact phone" id="contactPhone" name="contactPhone" type="tel"
                               inputMode="tel" value={form.contactPhone} onChange={handleChange} autoComplete="tel"
                               enterKeyHint="next"/>
                </div>

                <TextField label="Email" id="email" name="email" type="email" inputMode="email" value={form.email}
                           onChange={handleChange} required autoComplete="email" autoCapitalize="none"
                           spellCheck={false} enterKeyHint="next" error={errors.email}/>

                <PasswordField label="Password" id="password" name="password" value={form.password}
                               onChange={handleChange} required minLength={8} maxLength={72}
                               autoComplete="new-password" enterKeyHint="go"
                               hint="At least 8 characters." error={errors.password}/>

                {mutation.isError && (
                    <Callout tone="danger" role="alert">
                        {apiErrorMessage(mutation.error, "Registration failed. Check your details and try again.")}
                    </Callout>
                )}

                <Button type="submit" size="lg" block loading={mutation.isPending} loadingLabel="Creating account...">
                    Create account
                </Button>
            </form>
        </AuthLayout>
    );
}
