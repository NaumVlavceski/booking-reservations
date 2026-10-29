import {useEffect, useState, type ReactNode} from "react";
import {useLocation} from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import ChannelSyncNotes from "../components/ChannelSyncNotes";
import {useReturnTo} from "../lib/useReturnTo";

interface Picture {
    file: string;
    alt: string;
}

function HelpImage({file, alt}: Picture) {
    const [missing, setMissing] = useState(false);

    if (missing) {
        // Only while developing: show which picture is still to be added. Visitors just see no picture.
        return import.meta.env.DEV ? (
            <p className="max-w-full rounded-xl border border-dashed border-default px-3 py-6 text-center text-caption text-subtle">
                Picture to add: public/help/{file}
            </p>
        ) : null;
    }

    return (
        <figure className="max-w-full">
            {/* Small on the page (the screenshots differ a lot in size); a click opens the full-size picture */}
            <a href={`/help/${file}`} target="_blank" rel="noreferrer" title="Open full size" className="inline-block">
                <img
                    src={`/help/${file}`}
                    alt={alt}
                    loading="lazy"
                    onError={() => setMissing(true)}
                    className="block h-auto max-h-64 w-auto max-w-full rounded-xl border border-subtle shadow-card"
                />
            </a>
        </figure>
    );
}

function Steps({children}: { children: ReactNode }) {
    return <ol className="mt-4 space-y-6">{children}</ol>;
}

function Step({n, title, important = false, images = [], children}: {
    n: number;
    title: string;
    important?: boolean;
    images?: Picture[];
    children?: ReactNode;
}) {
    return (
        <li className="flex gap-3">
            <span
                aria-hidden="true"
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-body-sm font-semibold ${
                    important ? "bg-warning-solid text-on-warning-solid" : "bg-primary text-on-primary"
                }`}
            >
                {n}
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-fg">
                    <span className="sr-only">Step {n}: </span>
                    {important && (
                        <span className="mr-2 rounded border border-warning-line bg-warning-soft px-1.5 py-0.5 text-overline text-warning uppercase">
                            Important
                        </span>
                    )}
                    {title}
                </h3>
                {children && <div className="mt-1 space-y-2 text-body-sm leading-6 text-muted">{children}</div>}
                {images.length > 0 && (
                    // Pictures of one step sit side by side when they fit, and wrap onto the next line when they don't
                    <div className="mt-3 flex flex-wrap items-start gap-3">
                        {images.map((image) => <HelpImage key={image.file} {...image}/>)}
                    </div>
                )}
            </div>
        </li>
    );
}

function Section({id, title, children}: { id?: string; title: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-20 space-y-3 border-t border-subtle pt-8">
            <h2 className="text-title-2 text-fg">{title}</h2>
            {children}
        </section>
    );
}

// Buttons under the intro that jump to a part of the page (same ids as the Section elements below)
const jumpLinks = [
    {id: "booking", label: "Booking.com"},
    {id: "good-to-know", label: "Good to know"},
    {id: "problems", label: "Problems"},
];

export default function ConnectCalendarsHelpPage() {
    const {to: backTo, goBack} = useReturnTo("/dashboard/properties");
    const {hash} = useLocation();

    // A link such as .../connect-calendars#booking should land on that part of the guide
    useEffect(() => {
        const id = hash.slice(1);
        if (id) document.getElementById(id)?.scrollIntoView({block: "start"});
    }, [hash]);

    return (
        <div className="space-y-8">
            <div>
                <PageHeader
                    title="Connect Booking.com"
                    back={{
                        to: backTo,
                        onClick: (e) => {
                            e.preventDefault();
                            goBack();
                        },
                    }}
                    description="Keep all your channels on a single calendar, so that a booking on one platform automatically blocks those dates on the others. It takes about 5 minutes per room."
                    alerts={false}
                />
                <nav aria-label="On this page" className="-mt-1 flex flex-wrap gap-2">
                    {jumpLinks.map((link) => (
                        <a
                            key={link.id}
                            href={`#${link.id}`}
                            className="inline-flex min-h-11 items-center rounded-full border border-default bg-surface px-4 text-body-sm font-semibold text-fg transition-colors hover:border-primary hover:text-primary"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>
            </div>

            <Section title="How it works">
                <p className="text-body-sm leading-6 text-muted">
                    Booking.com shares its calendar through a calendar link. Nothing needs to be
                    installed, and no passwords are shared. There are two links to connect for each room.
                </p>
                <p className="text-body-sm leading-6 text-muted">
                    Each room has its own links. Set up the two-way connection for every room that is listed on
                    Booking.com.
                </p>
            </Section>

            <Section title="Things to know before you start">
                <ChannelSyncNotes/>
            </Section>

            <Section id="booking" title="Booking.com">
                <Steps>
                    <Step n={1} title="Each room must be set up individually.">
                        <p>Do the steps below once for every room.</p>
                    </Step>
                    <Step
                        n={2}
                        title="Open the calendar sync page on Booking.com"
                        images={[{
                            file: "booking-1-sync-calendars.png",
                            alt: "Rates and Availability with Sync calendars on the Booking.com extranet",
                        }]}
                    >
                        <p>
                            Log in to the Booking.com extranet (the admin area for hosts), open{" "}
                            <strong>Rates &amp; Availability</strong> and choose <strong>Sync calendars</strong>.
                        </p>
                    </Step>
                    <Step n={3} title="Select the room type that matches this room">
                        <p>
                            Booking.com gives one link per room type. Select the room type that matches the RoomTrack
                            room you are connecting, then click <strong>Add calendar connection</strong>.
                        </p>
                    </Step>
                    <Step
                        n={4}
                        title="Paste RoomTrack's link into Booking.com"
                        images={[
                            {file: "booking-2-export-copy.png", alt: "Copying the RoomTrack link in the room"},
                            {file: "booking-3-export-paste.png", alt: "Pasting the RoomTrack link under Import calendar on Booking.com"},
                        ]}
                    >
                        <p>
                            In RoomTrack, open the room and press <strong>Copy</strong> under{" "}
                            <strong>Send your bookings to other channels</strong>. On Booking.com, paste the link into
                            the empty field under <strong>Import calendar</strong> and click{" "}
                            <strong>Next step</strong>.
                        </p>
                    </Step>
                    <Step n={5} title="Copy Booking.com's link into RoomTrack">
                        <p>
                            Booking.com now shows a link of its own. Copy it, paste it into the empty field under{" "}
                            <strong>Bring in bookings from other channels</strong> in RoomTrack, and click{" "}
                            <strong>Connect</strong>.
                        </p>
                    </Step>
                    <Step n={6} title="Check that it works">
                        <p>
                            Click <strong>Sync now</strong> in RoomTrack. On Booking.com, the status should show{" "}
                            <strong>OK</strong>.
                        </p>
                    </Step>
                    <Step
                        n={7}
                        important
                        title="Choose “Booked dates only”"
                        images={[{file: "booking-4-decide-export.png", alt: "Decide what to export set to Booked dates only on Booking.com"}]}
                    >
                        <p>
                            In the <strong>Decide what to export</strong> section on Booking.com, select{" "}
                            <strong>Booked dates only</strong>.
                        </p>
                    </Step>
                </Steps>
            </Section>

            <Section id="good-to-know" title="Good to know">
                <div className="space-y-5 text-body-sm leading-6 text-muted">
                    <div>
                        <h3 className="font-semibold text-fg">RoomTrack only sends out the bookings you create in RoomTrack</h3>
                        <p>
                            A booking that comes from Booking.com appears on your RoomTrack calendar but is not forwarded
                            anywhere else. Keep an eye on <strong>Booking conflicts</strong> in the menu. RoomTrack shows
                            overlapping bookings there and also emails you.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-fg">Cancel on the platform, not just in RoomTrack</h3>
                        <p>
                            If you cancel a Booking.com booking only in RoomTrack, it reappears at the next
                            sync because it still exists on the platform. Cancel it there as well. RoomTrack then cancels
                            its own copy automatically.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-fg">Keep RoomTrack's link private</h3>
                        <p>
                            It lists your booked dates and guest names. Anyone who has the link can read them, so only
                            paste it into Booking.com.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-fg">Changing or removing a connection</h3>
                        <p>
                            <strong>Remove</strong> in the room disconnects a channel. Bookings already imported stay on
                            the calendar but stop updating. To use a new link, for example after resetting it on the
                            platform, remove the old connection and connect again.
                        </p>
                    </div>
                </div>
            </Section>

            <Section id="problems" title="Something is not working">
                <dl className="space-y-5 text-body-sm leading-6">
                    <div>
                        <dt className="font-semibold text-fg">
                            “Only Booking.com calendar links are supported.”
                        </dt>
                        <dd className="text-muted">
                            The link you pasted is not an export link from Booking.com. Check that you copied the link the
                            platform gives you, not the page address and not the box where you paste RoomTrack's link.
                            Links that start with <code className="rounded bg-surface-sunken px-1">webcal://</code> work too.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-fg">“This room already has a Booking.com calendar.”</dt>
                        <dd className="text-muted">
                            A room can have one Booking.com link. Remove the old one first, or use the other room.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-fg">A red “Not syncing” label</dt>
                        <dd className="text-muted">
                            The platform refused the link or could not be reached. This often happens when the link was
                            reset on the platform. Copy a fresh link, remove the old connection in RoomTrack and connect
                            again. If a calendar keeps failing, RoomTrack emails you (as long as notifications are on).
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-fg">Bookings are missing</dt>
                        <dd className="text-muted">
                            Press <strong>Sync now</strong>. Then check that the link comes from the right room type on Booking.com.
                        </dd>
                    </div>
                </dl>
            </Section>
        </div>
    );
}
