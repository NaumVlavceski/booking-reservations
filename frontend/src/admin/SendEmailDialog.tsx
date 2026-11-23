// Send email: To (prefilled with the owner's email when opened from an owner, editable), From read-only (set on the
// server), Subject, Message. A failed send keeps everything typed.
import {useEffect, useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import {LockIcon} from "../components/icons";
import {errorMessage} from "../lib/errors";
import {useToast} from "../lib/toast";
import {sendAdminEmail} from "./adminApi";
import {MailIcon} from "./adminUi";

const MAX_SUBJECT = 150;
const MAX_MESSAGE = 5000;

const inputClass = "w-full rounded-control border border-strong bg-surface px-3 text-body text-fg placeholder:text-subtle "
    + "focus:border-primary focus:ring-3 focus:ring-focus/30 focus:outline-none";

export default function SendEmailDialog({open, onClose, from, to: initialTo = "", ownerId}: {
    open: boolean;
    onClose: () => void;
    from: string;
    to?: string;
    ownerId?: string;
}) {
    const [to, setTo] = useState(initialTo);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const toast = useToast();
    const queryClient = useQueryClient();

    // A fresh form each time it opens (with the owner's address when opened from an owner)
    useEffect(() => {
        if (!open) return;
        setTo(initialTo);
        setSubject("");
        setMessage("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const send = useMutation({
        mutationFn: () => sendAdminEmail({to: to.trim(), subject: subject.trim(), message, ownerId}),
        onSuccess: (res) => {
            toast.show(`Email sent to ${to.trim()}.`, {tone: "success"});
            const owner = res.ownerId ?? ownerId;
            if (owner) void queryClient.invalidateQueries({queryKey: ["admin", "owner", owner, "emails"]});
            onClose();
        },
    });

    const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ");
    const valid = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to.trim()) && subject.trim().length > 0
        && message.trim().length > 0;

    return (
        <Sheet open={open} onClose={onClose} dismissible={!send.isPending} showClose size="md" title="Send email"
               icon={<span className="flex size-11 items-center justify-center rounded-card bg-primary-soft text-on-primary-soft"><MailIcon size={20}/></span>}
               footer={
                   <div className="space-y-2">
                       <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                           <Button variant="secondary" size="lg" onClick={onClose} disabled={send.isPending}>Cancel</Button>
                           <Button size="lg" type="submit" form="admin-send-email" disabled={!valid}
                                   loading={send.isPending} loadingLabel="Sending…" icon={<MailIcon size={18}/>}>
                               Send email
                           </Button>
                       </div>
                       <p className="text-center text-caption text-subtle sm:text-right">A copy is kept in the owner's email history.</p>
                   </div>
               }>
            <form id="admin-send-email" className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                if (valid && !send.isPending) send.mutate();
            }}>
                <label className="block">
                    <span className="mb-1 block text-body-sm font-semibold text-fg">To</span>
                    <input type="email" value={to} onChange={(e) => setTo(oneLine(e.target.value))} maxLength={254}
                           autoComplete="off" className={`${inputClass} min-h-12`}/>
                    <span className="mt-1 block text-caption text-muted">One address. Prefilled with the owner's email when opened from an owner.</span>
                </label>
                <div>
                    <span className="mb-1 block text-body-sm font-semibold text-fg">From</span>
                    <p className="flex min-h-12 items-center gap-2 rounded-control bg-surface-sunken px-3 text-body text-muted">
                        <LockIcon size={14}/>{from}
                    </p>
                    <span className="mt-1 block text-caption text-muted">Set on the server. Replies go to your own inbox.</span>
                </div>
                <label className="block">
                    <span className="mb-1 block text-body-sm font-semibold text-fg">Subject</span>
                    <input value={subject} onChange={(e) => setSubject(oneLine(e.target.value))} maxLength={MAX_SUBJECT}
                           className={`${inputClass} min-h-12`}/>
                </label>
                <label className="block">
                    <span className="mb-1 flex justify-between text-body-sm font-semibold text-fg">
                        Message <span className="num font-normal text-subtle">{message.length}/{MAX_MESSAGE}</span>
                    </span>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX_MESSAGE} rows={7}
                              className={`${inputClass} py-2`}/>
                    <span className="mt-1 block text-caption text-muted">Plain text. Line breaks are kept; nothing is added.</span>
                </label>
                {send.error && (
                    <Callout tone="danger" role="alert">{errorMessage(send.error, "The email could not be sent.")} Your text is still here.</Callout>
                )}
            </form>
        </Sheet>
    );
}
