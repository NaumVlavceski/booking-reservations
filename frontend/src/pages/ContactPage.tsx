import {useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom";
import {useMutation} from "@tanstack/react-query";
import {sendContactMessage} from "../lib/api/contact";
import {errorCode, errorMessage, fieldErrors} from "../lib/errors";
import {useInlineValidation, type ValidationMessages} from "../lib/useInlineValidation";
import AuthLayout from "../components/AuthLayout";
import {TextAreaField, TextField} from "../components/ui/Field";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";

// The same limits the server checks (ContactRequest.java)
const MAX = {email: 255, subject: 150, message: 5000};

const MESSAGES: ValidationMessages = {
    email: {valueMissing: "Enter your email address, so we can reply.", typeMismatch: "Enter an email address like name@example.com."},
    subject: {valueMissing: "Add a subject."},
    message: {valueMissing: "Write your message."},
};

const EMPTY = {email: "", subject: "", message: "", website: ""};

/** Why the message didn't go, in words for the visitor. */
function sendError(error: unknown): string {
    switch (errorCode(error)) {
        case "CONTACT_UNAVAILABLE":
            return "The contact form isn't available right now. Please try again later.";
        case "CONTACT_FAILED":
            return "Your message couldn't be sent right now. Please try again in a few minutes.";
        default:
            return errorMessage(error, "Couldn't send your message.");
    }
}

/**
 * The public contact form. The message is emailed to RoomTrack with the visitor's address as Reply-To, so the
 * visitor never needs RoomTrack's own address and the answer comes by normal email.
 */
export default function ContactPage() {
    const [form, setForm] = useState(EMPTY);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const {errors, validate, recheck, showServerErrors} = useInlineValidation(MESSAGES);

    useEffect(() => {
        document.title = "Contact RoomTrack";
        return () => {
            document.title = "RoomTrack";
        };
    }, []);

    const mutation = useMutation({
        mutationFn: sendContactMessage,
        onSuccess: (_, sent) => {
            setSentTo(sent.email);
            setForm(EMPTY);
        },
        onError: (error) => {
            const fields = fieldErrors(error);
            if (fields) showServerErrors(formRef.current, fields);
        },
    });

    function update(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
        setForm((current) => ({...current, [e.target.name]: e.target.value}));
        recheck(e.target);
        if (mutation.isError) mutation.reset();
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (mutation.isPending || !validate(e.currentTarget)) return;
        mutation.mutate({
            email: form.email.trim(),
            subject: form.subject.trim(),
            message: form.message.trim(),
            website: form.website,
        });
    }

    function writeAnother() {
        setSentTo(null);
        mutation.reset();
    }

    return (
        <AuthLayout
            title={sentTo ? "Message sent" : "Contact us"}
            subtitle={sentTo ? undefined : "Questions, feedback or a problem with RoomTrack? Write to us here and we'll reply by email."}
            footer={
                <p>
                    <Link to="/" className="link inline-flex min-h-11 items-center">Back to the home page</Link>
                </p>
            }
        >
            {sentTo ? (
                <div className="space-y-5">
                    <Callout tone="success" role="status" title="Thanks for writing">
                        We'll reply to <span className="font-semibold [overflow-wrap:anywhere]">{sentTo}</span>. If
                        you don't see our answer, check your spam folder.
                    </Callout>
                    <Button variant="secondary" size="lg" block onClick={writeAnother}>Write another message</Button>
                </div>
            ) : (
                <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
                    <TextField
                        label="Your email"
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="next"
                        maxLength={MAX.email}
                        value={form.email}
                        onChange={update}
                        required
                        hint="We only use it to reply to you."
                        error={errors.email}
                    />
                    <TextField
                        label="Subject"
                        id="subject"
                        name="subject"
                        autoComplete="off"
                        enterKeyHint="next"
                        maxLength={MAX.subject}
                        value={form.subject}
                        onChange={update}
                        required
                        error={errors.subject}
                    />
                    <TextAreaField
                        label="Message"
                        id="message"
                        name="message"
                        rows={6}
                        maxLength={MAX.message}
                        value={form.message}
                        onChange={update}
                        required
                        hint={form.message.length > MAX.message - 500
                            ? <span className="num">{MAX.message - form.message.length} characters left</span>
                            : undefined}
                        error={errors.message}
                    />

                    {/* Spam trap: off screen and skipped by keyboard and screen readers, so only bots fill it in */}
                    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                        <label htmlFor="website">Website (leave empty)</label>
                        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
                               value={form.website} onChange={update}/>
                    </div>

                    {mutation.isError && !fieldErrors(mutation.error) && (
                        <Callout tone="danger" role="alert">{sendError(mutation.error)}</Callout>
                    )}

                    <Button type="submit" size="lg" block loading={mutation.isPending} loadingLabel="Sending...">
                        Send message
                    </Button>

                    <p className="text-caption text-subtle">
                        Your message is emailed to us and not stored in RoomTrack. See the{" "}
                        <Link to="/privacy" className="link">privacy policy</Link>.
                    </p>
                </form>
            )}
        </AuthLayout>
    );
}
