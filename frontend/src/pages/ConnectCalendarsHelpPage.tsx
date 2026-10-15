import {useEffect, useState, type ReactNode} from "react";
import {Link, useLocation} from "react-router-dom";
import {ChevronLeftIcon} from "../components/icons";
import {useReturnTo} from "../lib/useReturnTo";

/*
 * Screenshots live in frontend/public/help/ and are served as /help/<file>. Add a file with one of these names
 * and it shows in its step; a step without its file simply has no picture (during `npm run dev` a dashed box
 * names the missing file).
 *
 *   booking-1-sync-calendars.png   Booking.com: Rates & Availability > Sync calendars
 *   booking-2-export-copy.png      Booking.com: the link Booking.com gives you, to copy
 *   booking-3-export-paste.png     Booking.com: Import calendar, with the RoomTrack link pasted
 *   booking-4-decide-export.png    Booking.com: "Decide what to export" > "Booked dates only"
 *   airbnb-1-sync-calendars.png    Airbnb: Availability settings > Connect calendars
 *   airbnb-2-import-paste.png      Airbnb: Import calendar, with the RoomTrack link pasted
 *   airbnb-3-export-copy.png       Airbnb: Export calendar, the link to copy
 */

interface Picture {
    file: string;
    alt: string;
}

function HelpImage({file, alt}: Picture) {
    const [missing, setMissing] = useState(false);

    if (missing) {
        // Only while developing: show which picture is still to be added. Visitors just see no picture.
        return import.meta.env.DEV ? (
            <p className="max-w-full rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
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
                    className="block h-auto max-h-64 w-auto max-w-full rounded-xl border border-slate-200 shadow-sm"
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
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
                    important ? "bg-amber-600" : "bg-teal-700"
                }`}
            >
                {n}
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900">
                    <span className="sr-only">Step {n}: </span>
                    {important && (
                        <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold tracking-wide text-amber-800 uppercase">
                            Important
                        </span>
                    )}
                    {title}
                </h3>
                {children && <div className="mt-1 space-y-2 text-sm leading-6 text-slate-600">{children}</div>}
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
        <section id={id} className="scroll-mt-20 space-y-3 border-t border-slate-200 pt-8">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
            {children}
        </section>
    );
}

// Buttons under the intro that jump to a part of the page (same ids as the Section elements below)
const jumpLinks = [
    {id: "booking", label: "Booking.com"},
    {id: "airbnb", label: "Airbnb"},
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
        <div className="space-y-8 pt-4">
            <div>
                <Link
                    to={backTo}
                    onClick={(e) => {
                        e.preventDefault();
                        goBack();
                    }}
                    className="back-link"
                >
                    <ChevronLeftIcon size={16}/>
                </Link>
                <h1 className="page-title">Connect Booking.com and Airbnb</h1>
                <p className="page-subtitle">
                    Keep all your channels on a single calendar, so that a booking on one platform automatically
                    blocks those dates on the others. It takes about 5 minutes per room.
                </p>
                <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-2">
                    {jumpLinks.map((link) => (
                        <a
                            key={link.id}
                            href={`#${link.id}`}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:border-teal-600 hover:text-teal-700"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>
            </div>

            <Section title="How it works">
                <p className="text-sm leading-6 text-slate-600">
                    Airbnb and Booking.com share their calendars through a calendar link. Nothing needs to be
                    installed, and no passwords are shared. There are two links to connect for each channel.
                </p>
                <p className="text-sm leading-6 text-slate-600">
                    Each room has its own links. Set up the two-way connection for every channel the room is listed
                    on, and repeat it for each room.
                </p>
            </Section>

            <Section title="Things to know before you start">
                <ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-slate-600">
                    <li>
                        When a booking is made on Booking.com or Airbnb, it appears on your calendar within<span className="text-red-700 font-bold"> 10
                        minutes</span>, or right away if you press the refresh button on the calendar. You also get an email
                        when it arrives.
                    </li>
                    <li>
                        Direct bookings sync within <span className="text-red-700 font-bold">3 hours</span>. Dates you
                        block in RoomTrack are automatically closed on
                        Booking.com and Airbnb, but the update can take up to 3 hours to appear.
                        To avoid double bookings, block the same dates directly on those platforms right away.
                    </li>
                </ul>
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

            <Section id="airbnb" title="Airbnb">
                {/* Not tested by the owner yet: the steps follow the same flow as Booking.com. Check them against Airbnb. */}
                <Steps>
                    <Step n={1} title="Connect each room separately">
                        <p>Do the steps below once for every room, with the Airbnb listing that matches it.</p>
                    </Step>
                    <Step
                        n={2}
                        title="Open the calendar connection options on Airbnb"
                        images={[{
                            file: "airbnb-1-sync-calendars.png",
                            alt: "Availability settings with Connect calendars on Airbnb",
                        }]}
                    >
                        <p>
                            Log in to Airbnb and open the calendar of the listing that matches this room. Open{" "}
                            <strong>Availability settings</strong> and choose <strong>Connect calendars</strong>{" "}
                            (sometimes called <strong>Sync calendars</strong>).
                        </p>
                    </Step>
                    <Step
                        n={3}
                        title="Paste RoomTrack's link into Airbnb"
                        images={[{file: "airbnb-2-import-paste.png", alt: "Import calendar on Airbnb with the RoomTrack link pasted"}]}
                    >
                        <p>
                            In RoomTrack, open the room and press <strong>Copy</strong> under{" "}
                            <strong>Send your bookings to other channels</strong>. On Airbnb, choose{" "}
                            <strong>Import calendar</strong>, paste the link, give it a name such as{" "}
                            <em>RoomTrack</em> and confirm.
                        </p>
                    </Step>
                    <Step
                        n={4}
                        title="Copy Airbnb's link into RoomTrack"
                        images={[{file: "airbnb-3-export-copy.png", alt: "Export calendar and the link to copy on Airbnb"}]}
                    >
                        <p>
                            On Airbnb, choose <strong>Export calendar</strong> and copy the link. Paste it into the
                            empty field under <strong>Bring in bookings from other channels</strong> in RoomTrack, and
                            click <strong>Connect</strong>.
                        </p>
                    </Step>
                    <Step n={5} title="Check that it works">
                        <p>
                            Click <strong>Sync now</strong> in RoomTrack. When it says <strong>Syncing</strong>, your
                            Airbnb bookings are on your calendar.
                        </p>
                    </Step>
                </Steps>
            </Section>

            <Section id="good-to-know" title="Good to know">
                <div className="space-y-5 text-sm leading-6 text-slate-600">
                    <div>
                        <h3 className="font-semibold text-slate-900">RoomTrack only sends out the bookings you create in RoomTrack</h3>
                        <p>
                            A booking that comes from Airbnb appears on your RoomTrack calendar but is not forwarded to
                            Booking.com, and the other way round. If a room is listed on both platforms, keep an eye on{" "}
                            <strong>Booking conflicts</strong> in the menu. RoomTrack shows overlapping bookings there
                            and also emails you.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Cancel on the platform, not just in RoomTrack</h3>
                        <p>
                            If you cancel an Airbnb or Booking.com booking only in RoomTrack, it reappears at the next
                            sync because it still exists on the platform. Cancel it there as well. RoomTrack then cancels
                            its own copy automatically.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Keep RoomTrack's link private</h3>
                        <p>
                            It lists your booked dates and guest names. Anyone who has the link can read them, so only
                            paste it into Airbnb and Booking.com.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Changing or removing a connection</h3>
                        <p>
                            <strong>Remove</strong> in the room disconnects a channel. Bookings already imported stay on
                            the calendar but stop updating. To use a new link, for example after resetting it on the
                            platform, remove the old connection and connect again.
                        </p>
                    </div>
                </div>
            </Section>

            <Section id="problems" title="Something is not working">
                <dl className="space-y-5 text-sm leading-6">
                    <div>
                        <dt className="font-semibold text-slate-900">
                            “Only Booking.com and Airbnb calendar links are supported.”
                        </dt>
                        <dd className="text-slate-600">
                            The link you pasted is not an export link from those two. Check that you copied the link the
                            platform gives you, not the page address and not the box where you paste RoomTrack's link.
                            Links that start with <code className="rounded bg-slate-100 px-1">webcal://</code> work too.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-slate-900">“This room already has an Airbnb calendar.”</dt>
                        <dd className="text-slate-600">
                            A room can have one link per channel. Remove the old one first, or use the other room.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-slate-900">A red “Not syncing” label</dt>
                        <dd className="text-slate-600">
                            The platform refused the link or could not be reached. This often happens when the link was
                            reset on the platform. Copy a fresh link, remove the old connection in RoomTrack and connect
                            again. If a calendar keeps failing, RoomTrack emails you (as long as notifications are on).
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-slate-900">Bookings are missing</dt>
                        <dd className="text-slate-600">
                            Press <strong>Sync now</strong>. Then check that the link comes from the right listing on
                            Airbnb, or the right room type on Booking.com.
                        </dd>
                    </div>
                </dl>
            </Section>
        </div>
    );
}
