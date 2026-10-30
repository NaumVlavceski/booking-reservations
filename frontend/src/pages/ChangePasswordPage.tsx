import {useRef, useState} from "react";
import {useMutation, useQuery} from "@tanstack/react-query";
import {changePassword, getMe} from "../lib/api/me";
import {errorCode, errorMessage} from "../lib/errors";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";
import {useReturnTo} from "../lib/useReturnTo";
import {useToast} from "../lib/toast";
import FormTopBar from "../components/FormTopBar";
import PasswordField from "../components/ui/PasswordField";
import Callout from "../components/ui/Callout";
import {SectionCard} from "../components/ui/Card";

const FALLBACK = "/dashboard/calendar";

const MESSAGES: ValidationMessages = {
    currentPassword: {valueMissing: "Enter your current password."},
    newPassword: {
        valueMissing: "Choose a new password.",
        tooShort: "Use at least 8 characters.",
        tooLong: "Use 72 characters or fewer.",
    },
    confirmPassword: {valueMissing: "Enter the new password again."},
};

const EMPTY = {currentPassword: "", newPassword: "", confirmPassword: ""};

export default function ChangePasswordPage() {
    const toast = useToast();
    const {goBack} = useReturnTo(FALLBACK);
    const {data: me} = useQuery({queryKey: ["me"], queryFn: getMe, staleTime: Infinity});
    const [form, setForm] = useState(EMPTY);
    const currentRef = useRef<HTMLInputElement>(null);
    const confirmRef = useRef<HTMLInputElement>(null);
    const {errors, validate, recheck, setError} = useInlineValidation(MESSAGES);

    const mutation = useMutation({
        mutationFn: changePassword,
        onSuccess: (data) => {
            // The old token stopped working with the change; this one keeps the device signed in
            tokenStorage.set(data.token);
            setForm(EMPTY);
            toast.show("Password changed. Your other devices were signed out.");
            goBack();
        },
        onError: (error) => {
            if (errorCode(error) === "WRONG_PASSWORD") {
                setError("currentPassword", errorMessage(error, "Your current password is not correct."));
                setForm((f) => ({...f, currentPassword: ""}));
                currentRef.current?.focus();
            }
        },
    });

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (mutation.isPending || !validate(e.currentTarget)) return;
        if (form.newPassword !== form.confirmPassword) {
            setError("confirmPassword", "The passwords don't match.");
            confirmRef.current?.focus();
            return;
        }
        mutation.mutate({currentPassword: form.currentPassword, newPassword: form.newPassword});
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const next = {...form, [e.target.name]: e.target.value};
        setForm(next);
        recheck(e.target);
        if (mutation.isError) mutation.reset();
        // Clear the mismatch note as soon as the two agree
        if (errors.confirmPassword && next.newPassword === next.confirmPassword) setError("confirmPassword", null);
    }

    function otherError(error: unknown): string {
        return errorMessage(error, "Couldn't change the password.");
    }

    const isDirty = Boolean(form.currentPassword || form.newPassword || form.confirmPassword);

    return (
        <div className="mx-auto max-w-2xl">
            <FormTopBar formId="password-form" saving={mutation.isPending} title="Change password"
                        isDirty={isDirty} back={{to: FALLBACK}}/>

            <form id="password-form" onSubmit={handleSubmit} noValidate className="space-y-4">
                <SectionCard id="password-details" title="Change password"
                             description="You'll stay signed in here. Any other devices will be signed out.">
                    {/* Lets password managers update the saved password for the right account */}
                    <input type="email" autoComplete="username" value={me?.email ?? ""} readOnly hidden/>
                    <PasswordField
                        label="Current password"
                        id="currentPassword"
                        name="currentPassword"
                        ref={currentRef}
                        autoFocus
                        value={form.currentPassword}
                        onChange={handleChange}
                        required
                        maxLength={72}
                        autoComplete="current-password"
                        enterKeyHint="next"
                        error={errors.currentPassword}
                    />
                    <PasswordField
                        label="New password"
                        id="newPassword"
                        name="newPassword"
                        value={form.newPassword}
                        onChange={handleChange}
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
                        value={form.confirmPassword}
                        onChange={handleChange}
                        required
                        maxLength={72}
                        autoComplete="new-password"
                        enterKeyHint="done"
                        error={errors.confirmPassword}
                    />
                </SectionCard>

                {mutation.isError && errorCode(mutation.error) !== "WRONG_PASSWORD" && (
                    <Callout tone="danger" role="alert">{otherError(mutation.error)}</Callout>
                )}
            </form>
        </div>
    );
}
