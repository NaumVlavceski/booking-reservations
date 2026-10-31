import {errorMessage, fieldErrors} from "../lib/errors";
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
import LegalLinks from "../components/LegalLinks";
import {AlertCircleIcon} from "../components/icons";
import {LEGAL_VERSIONS} from "../legal/versions";

const MESSAGES: ValidationMessages = {
    acceptedTerms: {valueMissing: "Please accept the Terms of Service and the Privacy Policy to create an account."},
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
        contactPhone: "",
        email: "",
        password: "",
        fullName: "",
        acceptedTerms: false,
    });
    const {errors, validate, recheck, showServerErrors, otherErrors} = useInlineValidation(MESSAGES);

    const mutation = useMutation({
        mutationFn: register,
        onSuccess: (data) => {
            // No token until the emailed code is entered; a brand-new account then sets up its first property.
            navigate("/verify-email", {replace: true, state: {email: data.email, welcome: true}});
        },
        onError: (error) => {
            const fields = fieldErrors(error);
            if (fields) showServerErrors(document.getElementById("register-form") as HTMLFormElement | null, fields);
        },
    });

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!validate(e.currentTarget)) return;
        // The versions on screen right now are the ones being accepted (stored with the time by the server)
        mutation.mutate({...form, termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy});
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm({...form, [e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value});
        recheck(e.target);
    }

    return (
        <AuthLayout
            title="Create your account"
            subtitle="Start managing your rentals in minutes"
            footer={<>
                <p>Already have an account? <Link to="/login" className="link inline-flex min-h-11 items-center">Log in</Link></p>
                <LegalLinks/>
            </>}
        >
            <form id="register-form" onSubmit={handleSubmit} noValidate className="space-y-5">
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

                <div>
                    <label htmlFor="acceptedTerms" className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-body-sm text-muted">
                        <input type="checkbox" id="acceptedTerms" name="acceptedTerms" required
                               checked={form.acceptedTerms} onChange={handleChange}
                               aria-invalid={errors.acceptedTerms ? true : undefined}
                               aria-describedby={errors.acceptedTerms ? "acceptedTerms-error" : undefined}
                               className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"/>
                        <span>
                            {/* New tab: following a link must not lose what was typed in the form */}
                            I agree to the{" "}
                            <Link to="/terms" target="_blank" rel="noopener" className="link">Terms of Service</Link>
                            {" "}and the{" "}
                            <Link to="/privacy" target="_blank" rel="noopener" className="link">Privacy Policy</Link>.
                        </span>
                    </label>
                    {errors.acceptedTerms && (
                        <p id="acceptedTerms-error" className="field-error">
                            <AlertCircleIcon className="mt-0.5"/>
                            <span>{errors.acceptedTerms}</span>
                        </p>
                    )}
                </div>

                {mutation.isError && (
                    <Callout tone="danger" role="alert">
                        {otherErrors.length > 0 ? otherErrors.join(" ") : errorMessage(mutation.error, "Couldn't create your account.")}
                    </Callout>
                )}

                <Button type="submit" size="lg" block loading={mutation.isPending} loadingLabel="Creating account...">
                    Create account
                </Button>
            </form>
        </AuthLayout>
    );
}
