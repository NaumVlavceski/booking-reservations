import {useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {contactSendError, MAX_MESSAGE, sendSupportMessage} from "../lib/api/contact";
import {useToast} from "../lib/toast";
import {useOnlineStatus} from "../lib/useOnlineStatus";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import Callout from "./ui/Callout";
import {TextAreaField} from "./ui/Field";

const FORM_ID = "support-form";

/**
 * "Contact support" from the menu: one message box and Send. It goes to the same inbox as the public contact
 * form; the reply comes to the account's own email, so there is no email or subject to fill in. Closing the
 * dialog keeps what was typed until it is sent.
 */
export default function SupportDialog({open, onClose, email}: {
    open: boolean;
    onClose: () => void;
    /** The signed-in account's email: where the reply will go. */
    email: string | undefined;
}) {
    const toast = useToast();
    const online = useOnlineStatus();
    const [message, setMessage] = useState("");
    const [missing, setMissing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const mutation = useMutation({
        mutationFn: sendSupportMessage,
        onSuccess: () => {
            setMessage("");
            onClose();
            // Longer than the usual 2 s: there's an email address to read.
            toast.show(email ? `Message sent. We'll reply to ${email}.` : "Message sent. We'll reply by email.",
                {durationMs: 4000});
        },
    });

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (mutation.isPending) return;
        if (!message.trim()) {
            setMissing(true);
            textareaRef.current?.focus();
            return;
        }
        mutation.mutate(message.trim());
    }

    return (
        <Sheet
            open={open}
            onClose={onClose}
            dismissible={!mutation.isPending}
            title="Contact support"
            description={email
                ? <>Questions, feedback or a problem? We'll reply to <span className="font-semibold text-fg [overflow-wrap:anywhere]">{email}</span>.</>
                : "Questions, feedback or a problem? We'll reply by email."}
            showClose
            initialFocusRef={textareaRef}
            footer={
                <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
                    <Button type="submit" form={FORM_ID} loading={mutation.isPending} loadingLabel="Sending..."
                            disabled={!online} className="min-w-20">
                        Send
                    </Button>
                </div>
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
                <TextAreaField
                    ref={textareaRef}
                    label="Message"
                    id="support-message"
                    name="message"
                    rows={6}
                    maxLength={MAX_MESSAGE}
                    value={message}
                    onChange={(e) => {
                        setMessage(e.target.value);
                        if (e.target.value.trim()) setMissing(false);
                        if (mutation.isError) mutation.reset();
                    }}
                    required
                    error={missing ? "Write your message." : undefined}
                />
                {mutation.isError && (
                    <Callout tone="danger" role="alert">{contactSendError(mutation.error)}</Callout>
                )}
                {!online && <p role="status" className="text-body-sm text-muted">You're offline. Connect to send.</p>}
            </form>
        </Sheet>
    );
}
