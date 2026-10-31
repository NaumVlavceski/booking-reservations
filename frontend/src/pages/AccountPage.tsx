import {useRef, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {deleteAccount, downloadMyData, meQuery} from "../lib/api/me";
import {errorCode, errorMessage, logError} from "../lib/errors";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {clearOfflineCalendar} from "../lib/offlineCalendar";
import {useFromHere} from "../lib/useReturnTo";
import {useToast} from "../lib/toast";
import PageHeader from "../components/ui/PageHeader";
import {SectionCard} from "../components/ui/Card";
import Button from "../components/ui/Button";
import Callout from "../components/ui/Callout";
import {TextField} from "../components/ui/Field";
import PasswordField from "../components/ui/PasswordField";
import {DownloadIcon, LockIcon, TrashIcon} from "../components/icons";

const CONFIRM_WORD = "DELETE";

/** Leaves nothing of a deleted account in this browser: its sign-in, saved calendar and the settings kept per email. */
function forgetAccountOnThisDevice(email: string | undefined) {
    tokenStorage.clear();
    clearOfflineCalendar();
    try {
        const owned = (key: string) => (email && key.toLowerCase().endsWith(email.toLowerCase()))
            || key === "roomtrack.lastPropertyId" || key === "roomtrack.calendar.collapsedProperties";
        Object.keys(localStorage).filter(owned).forEach((key) => localStorage.removeItem(key));
    } catch {
        // Storage unavailable: nothing was kept there either.
    }
}

/** Your details, a copy of your data, and deleting the account (the privacy rights from the Privacy Policy). */
export default function AccountPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const queryClient = useQueryClient();
    const fromHere = useFromHere();
    const {data: me} = useQuery(meQuery);

    const [downloading, setDownloading] = useState(false);
    async function download() {
        setDownloading(true);
        try {
            await downloadMyData();
            toast.show("Your data was downloaded.");
        } catch (error) {
            logError(error, "Data export");
            toast.show(errorMessage(error, "Couldn't download your data."), {tone: "error"});
        } finally {
            setDownloading(false);
        }
    }

    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const confirmed = confirmation.trim() === CONFIRM_WORD;

    const deletion = useMutation({
        mutationFn: deleteAccount,
        onSuccess: () => {
            forgetAccountOnThisDevice(me?.email);
            queryClient.clear();
            navigate("/login", {replace: true, state: {accountDeleted: true}});
        },
        onError: (error) => {
            if (errorCode(error) === "WRONG_PASSWORD") {
                setPasswordError("Your password is not correct.");
                setPassword("");
                passwordRef.current?.focus();
            }
        },
    });

    function handleDelete(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!password) {
            setPasswordError("Enter your password.");
            passwordRef.current?.focus();
            return;
        }
        if (!confirmed || deletion.isPending) return;
        deletion.mutate({password, confirmation: confirmation.trim()});
    }

    return (
        <div className="mx-auto max-w-2xl">
            <PageHeader title="Account" description="Your details, a copy of your data, and deleting your account." alerts={false}/>

            <div className="space-y-4">
                <SectionCard id="account-details" title="Your details">
                    <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-subtle">Name</dt>
                            <dd className="mt-0.5 font-medium break-words text-fg">{me?.fullName ?? "…"}</dd>
                        </div>
                        <div>
                            <dt className="text-subtle">Email</dt>
                            <dd className="mt-0.5 font-medium break-all text-fg">{me?.email ?? "…"}</dd>
                        </div>
                    </dl>
                    <Link to="/dashboard/account/password" state={fromHere}
                          className="inline-flex min-h-11 items-center gap-2 text-body-sm font-semibold text-primary hover:underline">
                        <LockIcon size={18}/>
                        Change password
                    </Link>
                </SectionCard>

                <SectionCard id="account-export" title="Download my data"
                             description="A copy of everything in your account as a JSON file: your details, properties, rooms, bookings with guest details, booking conflicts and the list of emails we sent you. Calendar links are left out, because anyone who has them can read your calendar.">
                    <div>
                        <Button variant="secondary" icon={<DownloadIcon size={18}/>} onClick={download}
                                loading={downloading} loadingLabel="Preparing your file...">
                            Download my data
                        </Button>
                    </div>
                </SectionCard>

                <SectionCard id="account-delete" title="Delete my account">
                    <div className="space-y-3 text-body-sm text-muted">
                        <p>This deletes, <strong className="text-fg">immediately and for good</strong>:</p>
                        <ul className="list-disc space-y-1 pl-5 marker:text-subtle">
                            <li>your account, and you are signed out on every device;</li>
                            <li>all your properties, rooms and bookings, including your guests' details;</li>
                            <li>your connected Booking.com calendars and booking conflicts;</li>
                            <li>your settings and the list of emails we sent you.</li>
                        </ul>
                        <p>It cannot be undone. Download your data first if you want to keep a copy.</p>
                    </div>

                    <Callout tone="warning" title="Remove RoomTrack's links from Booking.com">
                        Each room's RoomTrack calendar link stops working when the account is deleted. Remove them under{" "}
                        <strong>Sync calendars</strong> on Booking.com, so it doesn't keep trying to read them.
                    </Callout>

                    <form onSubmit={handleDelete} noValidate className="space-y-4">
                        {/* Lets password managers fill the password of the right account */}
                        <input type="email" autoComplete="username" value={me?.email ?? ""} readOnly hidden/>
                        <PasswordField
                            label="Your password"
                            id="deletePassword"
                            name="deletePassword"
                            ref={passwordRef}
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setPasswordError(null);
                                if (deletion.isError) deletion.reset();
                            }}
                            required
                            maxLength={72}
                            autoComplete="current-password"
                            enterKeyHint="next"
                            error={passwordError ?? undefined}
                        />
                        <TextField
                            label={`Type ${CONFIRM_WORD} to confirm`}
                            id="deleteConfirmation"
                            name="deleteConfirmation"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            enterKeyHint="done"
                        />

                        {deletion.isError && errorCode(deletion.error) !== "WRONG_PASSWORD" && (
                            <Callout tone="danger" role="alert">
                                {errorMessage(deletion.error, "Couldn't delete your account.")}
                            </Callout>
                        )}

                        <Button type="submit" variant="danger" icon={<TrashIcon size={18}/>} disabled={!confirmed}
                                loading={deletion.isPending} loadingLabel="Deleting your account...">
                            Delete my account
                        </Button>
                    </form>
                </SectionCard>

                <p className="flex flex-wrap gap-x-6 pb-2 text-body-sm">
                    <Link to="/privacy" className="link inline-flex min-h-11 items-center">Privacy Policy</Link>
                    <Link to="/terms" className="link inline-flex min-h-11 items-center">Terms of Service</Link>
                </p>
            </div>
        </div>
    );
}
