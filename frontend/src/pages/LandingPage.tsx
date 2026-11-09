import {type ReactNode, useEffect} from "react";
import {Link} from "react-router-dom";
import AppLogo from "../components/AppLogo";
import {demoErrorMessage, useStartDemo} from "../lib/useStartDemo";
import {
    ArrowRightIcon,
    CalendarIcon,
    CalendarXIcon,
    CheckIcon,
    ChevronDownIcon,
    DownloadIcon,
    MoveIcon,
    SyncIcon,
    WifiOffIcon,
} from "../components/icons";
import Button, {ButtonLink} from "../components/ui/Button";
import {DEMO_ENABLED} from "../lib/demo";

/**
 * The video tour. Put the files in public/landing/ and fill these in, e.g. src: "/landing/tour.mp4",
 * poster: "/landing/tour-poster.jpg", captions: "/landing/tour.en.vtt", length: "2 min". While src is empty the page
 * shows a placeholder in the video's place.
 */
const VIDEO_TOUR = {
    src: "/landing/product-tour.mp4",
    // The frame at 0:11: the sample calendar with "Every booking on one calendar."
    poster: "/landing/product-tour-poster.jpg",
    captions: "",
    length: "1 min",
};

const NAV = [
    {href: "#features", label: "Features"},
    {href: "#video-tour", label: "Video tour"},
    {href: "#how-it-works", label: "How it works"},
    {href: "#pricing", label: "Pricing"},
    {href: "#faq", label: "FAQ"},
];

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
    {
        icon: <CalendarIcon size={20}/>,
        title: "One calendar for every room",
        text: "All your properties and rooms on one timeline. Arrivals, departures and free nights are visible without opening a single booking.",
    },
    {
        icon: <CalendarXIcon size={20}/>,
        title: "Double bookings are refused",
        text: "Every new stay and every change is checked before it is saved. Two guests can never share a night in the same room.",
    },
    {
        icon: <MoveIcon size={20}/>,
        title: "Move or copy a stay",
        text: "A guest wants the bigger room? Move the booking. If those nights are taken there, nothing changes and you see why.",
    },
    {
        icon: <SyncIcon size={20}/>,
        title: "Booking.com sync through iCal",
        text: "Booking.com reservations come in on their own, and dates booked in RoomTrack close on Booking.com. No password is shared.",
    },
    {
        icon: <CheckIcon size={20}/>,
        title: "See who has paid",
        text: "Mark a booking as paid and its bar turns green. What is still due stays on the bar, so nothing is forgotten at check-out.",
    },
    {
        icon: <DownloadIcon size={20}/>,
        title: "Earnings per room and property",
        text: "Confirmed and paid bookings add up per room and per property, for any dates you pick. Download them as an Excel file.",
    },
];

const STEPS: { title: string; text: string; code?: string }[] = [
    {
        title: "Add your property and rooms",
        text: "Name them the way you and your guests do: Apartment 1, Studio, the room with the lake view.",
    },
    {
        title: "Connect your calendars",
        text: "Paste Booking.com's calendar link into RoomTrack, then copy RoomTrack's link into Booking.com. About 5 minutes per room.",
        code: "roomtrack.app/api/ical/…",
    },
    {
        title: "Take bookings anywhere",
        text: "Add direct guests from your phone. Booking.com stays appear on their own and block those nights.",
    },
];

const ICAL_FACTS = [
    {
        title: "Imported stays show dates only",
        text: "Booking.com's calendar link carries the dates, not the guest's name or the price. Add those to the booking yourself if you want them in your earnings.",
    },
    {
        title: "Each site decides how often it reads your calendar",
        text: "RoomTrack checks Booking.com every 10 minutes, and you can sync by hand at any time. Booking.com reads RoomTrack's calendar on its own schedule, so a date you close here reaches it at its next check.",
    },
    {
        title: "Cancel on Booking.com, not just in RoomTrack",
        text: "A Booking.com stay you cancel only in RoomTrack comes back at the next sync, because it still exists on Booking.com. Cancel it there, and RoomTrack follows.",
    },
];

const PLAN = [
    "Calendar, bookings, moves and copies between rooms",
    "Booking.com sync through iCal",
    "Paid and due amounts, earnings and Excel export",
    "Install on Android and iPhone",
];

/** phoneOnly: on a phone the "What iCal can and can't carry" section is hidden to keep the page short; these carry it. */
const FAQ: { question: string; answer: ReactNode; phoneOnly?: boolean }[] = [
    {
        question: "Does RoomTrack replace Booking.com?",
        answer: "No. Guests still book where they do today. RoomTrack reads those bookings through Booking.com's calendar link, keeps them next to your own guests, and closes the dates on Booking.com that are booked here.",
    },
    {
        question: "How fast do the calendars update?",
        answer: "RoomTrack checks every connected calendar every 10 minutes, and the sync button on the calendar checks right away. Booking.com reads RoomTrack's calendar on its own schedule.",
    },
    {
        question: "Do Booking.com stays show the guest's name?",
        answer: "No. Booking.com's calendar link carries the dates, not the guest's name or the price. Add those to the booking yourself if you want them in your earnings.",
        phoneOnly: true,
    },
    {
        question: "Can I cancel a Booking.com stay in RoomTrack?",
        answer: "Cancel it on Booking.com. A stay you cancel only in RoomTrack comes back at the next sync, because it still exists on Booking.com. Cancel it there, and RoomTrack follows.",
        phoneOnly: true,
    },
    {
        question: "What happens if I try to double-book a room?",
        answer: "RoomTrack refuses to save it and tells you the nights are taken. A check-out day can be the next guest's check-in day. If a Booking.com stay arrives on nights that are already taken, it shows on the Conflicts page for you to sort out.",
    },
    {
        question: "Is my guests' data safe?",
        answer: (
            <>
                Each account only ever sees its own properties and bookings. You can delete your account, with all its
                bookings, at any time. The <Link to="/privacy" className="link">privacy policy</Link> explains what is
                stored and why.
            </>
        ),
    },
    {
        question: "Can I use it on my phone?",
        answer: "Yes, it is made for phones first. Add it to your home screen to open it like an app, and if the internet drops, the calendar you last saw stays readable.",
    },
    {
        question: "Can I try it first?",
        answer: DEMO_ENABLED
            ? "Yes. The live demo gives you your own copy of sample properties and bookings, with no sign-up. It is deleted after an hour."
            : "Yes. Creating an account is free, and you can delete it at any time.",
    },
];

/** The public home page, for visitors who are not signed in. */
export default function LandingPage() {
    useEffect(() => {
        document.title = "RoomTrack: every booking on one calendar";
        return () => {
            document.title = "RoomTrack";
        };
    }, []);

    return (
        <div className="min-h-dvh bg-canvas text-fg">
            <Header/>
            <main>
                <Hero/>
                <Audience/>
                <VideoTour/>
                <Features/>
                <HowItWorks/>
                <IcalFacts/>
                <InstallApp/>
                {DEMO_ENABLED && <DemoCard/>}
                <Pricing/>
                <Faq/>
                <FinalCall/>
            </main>
            <Footer/>
        </div>
    );
}

function Container({children, className = ""}: { children: ReactNode; className?: string }) {
    return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

function SectionTitle({id, children, text, className = ""}: { id: string; children: ReactNode; text?: string; className?: string }) {
    return (
        <div className={`max-w-xl ${className}`}>
            <h2 id={id} className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.25rem]">{children}</h2>
            {text && <p className="mt-3 text-body text-muted">{text}</p>}
        </div>
    );
}

function Header() {
    return (
        <header className="sticky top-0 z-(--rt-z-sticky) border-b border-subtle bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
            <Container className="flex h-16 items-center gap-6">
                <Link to="/" className="flex items-center gap-2 text-title-3 font-bold">
                    <AppLogo size={30}/>
                    RoomTrack
                </Link>
                {/* From 1024px: at tablet width the five links don't fit next to the logo and buttons */}
                <nav aria-label="Home page" className="hidden flex-1 justify-center gap-1 lg:flex">
                    {NAV.map((item) => (
                        <a key={item.href} href={item.href}
                           className="rounded-control px-3 py-2 text-body-sm font-medium whitespace-nowrap text-muted hover:bg-surface-hover hover:text-fg">
                            {item.label}
                        </a>
                    ))}
                </nav>
                <div className="ml-auto flex items-center gap-2 lg:ml-0">
                    <ButtonLink to="/login" variant="quiet" size="sm">Log in</ButtonLink>
                    <ButtonLink to="/register" size="sm">Register</ButtonLink>
                </div>
            </Container>
        </header>
    );
}

/** Starts a private demo (only rendered when the demo is on), with the reason underneath if it couldn't. */
function DemoButton({size = "md", className = "", errorClassName = "text-danger"}: {
    size?: "md" | "lg";
    className?: string;
    errorClassName?: string;
}) {
    const demo = useStartDemo();
    return (
        <div>
            <Button size={size} icon={<ArrowRightIcon size={18}/>} onClick={() => demo.mutate()} className={className}
                    loading={demo.isPending} loadingLabel="Preparing your demo...">
                Try the live demo
            </Button>
            {demo.isError && (
                <p role="alert" className={`mt-2 max-w-xs text-body-sm font-medium ${errorClassName}`}>{demoErrorMessage(demo.error)}</p>
            )}
        </div>
    );
}

function Hero() {
    return (
        <section aria-labelledby="hero-title" className="overflow-hidden">
            <Container className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-20">
                <div>
                    <h1 id="hero-title" className="text-[2.5rem] leading-[1.05] font-extrabold tracking-tight sm:text-[3.5rem]">
                        Every booking on one calendar.
                    </h1>
                    <p className="mt-5 max-w-md text-title-3 font-normal text-muted">
                        RoomTrack is the reservation manager for owners of apartments and guesthouses. Add direct
                        bookings, bring in Booking.com, and see who arrives, who leaves and which room is free.
                    </p>
                    <div className="mt-8 flex flex-wrap items-start gap-3">
                        {DEMO_ENABLED && <DemoButton size="lg"/>}
                        <ButtonLink to="/register" size="lg" variant={DEMO_ENABLED ? "secondary" : "primary"}>
                            Create an account
                        </ButtonLink>
                    </div>
                    {DEMO_ENABLED && (
                        <p className="mt-3 text-caption text-subtle">
                            The demo opens your own copy of sample properties and guests. No account needed.
                        </p>
                    )}
                    <a href="#video-tour" className="link mt-6 inline-flex items-center gap-2 text-body-sm font-semibold">
                        <PlayIcon size={18}/>
                        Watch the video tour
                    </a>
                </div>
                {/* A phone gets the phone picture (the wide calendar is unreadable that small); from 640px, the calendar
                    from the video tour at 0:12. The browser downloads only the one it shows. */}
                <picture className="block sm:overflow-hidden sm:rounded-card sm:border sm:border-subtle sm:bg-surface sm:shadow-popover">
                    <source media="(min-width: 640px)" srcSet="/landing/hero-calendar.jpg" width={1560} height={800}/>
                    <img
                        src="/landing/calendar-phone.png"
                        width={357}
                        height={700}
                        alt="The RoomTrack calendar with Booking.com, direct, paid and blocked stays in November."
                        className="mx-auto block h-auto w-52 sm:w-full"
                        fetchPriority="high"
                    />
                </picture>
            </Container>
        </section>
    );
}

function Audience() {
    return (
        <section aria-label="Who it is for" className="border-y border-subtle bg-surface-sunken">
            <Container className="flex flex-col gap-3 py-5 lg:flex-row lg:items-center lg:gap-8">
                <p className="text-body-sm font-semibold">For owners who run one to a few properties themselves.</p>
                <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-muted">
                    {["Direct bookings and Booking.com in one view", "Works on a phone", "Earnings per room and property"].map((item) => (
                        <li key={item} className="flex items-center gap-2">
                            <CheckIcon size={16} className="shrink-0 text-primary"/>
                            {item}
                        </li>
                    ))}
                </ul>
            </Container>
        </section>
    );
}

function VideoTour() {
    const chapters = [
        {title: "Add a reservation", text: "Pick the room, the dates and the guest. The calendar updates at once."},
        {title: "Move it to another room", text: "RoomTrack checks the new nights first and refuses if they are taken."},
        {title: "Connect Booking.com", text: "Paste one link in each direction, and the calendars stay in step."},
        {title: "Read your earnings", text: "Per room and per property, ready to download as an Excel file."},
    ];
    return (
        <section id="video-tour" aria-labelledby="video-title" className="scroll-mt-20 py-16 sm:py-20">
            <Container>
                <SectionTitle id="video-title" text="Watch how a new reservation goes in, moves to another room and shows up in your earnings.">
                    See a full booking, start to finish.
                </SectionTitle>
                <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <figure>
                        {VIDEO_TOUR.src ? (
                            <video controls preload="metadata" playsInline poster={VIDEO_TOUR.poster || undefined}
                                   className="aspect-video w-full rounded-card bg-black shadow-popover">
                                <source src={VIDEO_TOUR.src}/>
                                {VIDEO_TOUR.captions && <track kind="captions" src={VIDEO_TOUR.captions} srcLang="en" label="English" default/>}
                            </video>
                        ) : (
                            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-default bg-surface text-muted">
                                <span className="flex size-16 items-center justify-center rounded-full bg-primary text-on-primary shadow-popover">
                                    <PlayIcon size={28}/>
                                </span>
                                <span className="text-body-sm font-semibold">Video tour coming soon</span>
                            </div>
                        )}
                        <figcaption className="mt-3 text-caption text-subtle">
                            Product tour{VIDEO_TOUR.length && ` · ${VIDEO_TOUR.length}`}
                            {VIDEO_TOUR.captions && " · Captions available"}
                        </figcaption>
                    </figure>
                    <ol className="space-y-3">
                        {chapters.map((chapter, i) => (
                            <li key={chapter.title} className="flex gap-3 rounded-card border border-subtle bg-surface p-4">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-bold text-primary">
                                    {i + 1}
                                </span>
                                <div>
                                    <h3 className="text-body-sm font-semibold">{chapter.title}</h3>
                                    <p className="mt-1 text-body-sm text-muted">{chapter.text}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </Container>
        </section>
    );
}

function Features() {
    return (
        <section id="features" aria-labelledby="features-title" className="scroll-mt-20 pb-16 sm:pb-20">
            <Container>
                <SectionTitle id="features-title">The tools a small owner uses every day.</SectionTitle>
                <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((feature) => (
                        <li key={feature.title} className="rounded-card border border-subtle bg-surface p-5 shadow-card">
                            <span className="flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary">
                                {feature.icon}
                            </span>
                            <h3 className="mt-4 text-title-3">{feature.title}</h3>
                            <p className="mt-2 text-body-sm text-muted">{feature.text}</p>
                        </li>
                    ))}
                </ul>
            </Container>
        </section>
    );
}

function HowItWorks() {
    return (
        // A deep teal band in both themes
        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 bg-[#0B3B40] py-16 text-white sm:py-20">
            <Container>
                <SectionTitle id="how-title" className="[&_p]:text-white/75" text="You add your rooms once. After that, the calendar does the checking.">
                    Set up in an afternoon, not a week.
                </SectionTitle>
                <ol className="mt-10 grid gap-8 md:grid-cols-3">
                    {STEPS.map((step, i) => (
                        <li key={step.title} className="border-t border-white/20 pt-5">
                            <span className="text-[2rem] leading-none font-extrabold text-[#7FD6D9]">{i + 1}</span>
                            <h3 className="mt-3 text-title-3">{step.title}</h3>
                            <p className="mt-2 text-body-sm text-white/75">{step.text}</p>
                            {step.code && (
                                <code className="mt-3 inline-block rounded-tag bg-black/30 px-2.5 py-1 font-mono text-caption text-white/90">
                                    {step.code}
                                </code>
                            )}
                        </li>
                    ))}
                </ol>
            </Container>
        </section>
    );
}

function IcalFacts() {
    return (
        // Not on a phone, to keep the page short: the FAQ's phoneOnly questions say the same there
        <section aria-labelledby="ical-title" className="hidden py-16 sm:block sm:py-20">
            <Container className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <SectionTitle id="ical-title" text="Booking sites share dates through iCal, and that is all they share. Here is what that means in practice.">
                    What iCal can and can't carry.
                </SectionTitle>
                <ul className="space-y-3">
                    {ICAL_FACTS.map((fact) => (
                        <li key={fact.title} className="rounded-card border border-subtle bg-surface p-5">
                            <h3 className="text-body font-semibold">{fact.title}</h3>
                            <p className="mt-1.5 text-body-sm text-muted">{fact.text}</p>
                        </li>
                    ))}
                </ul>
            </Container>
        </section>
    );
}

function InstallApp() {
    const ways = [
        {name: "Android", steps: ["Open RoomTrack in Chrome", "Tap the ⋮ menu", "Tap Install app"]},
        {name: "iPhone", steps: ["Open RoomTrack in Safari", "Tap Share", "Tap Add to Home Screen"]},
    ];
    return (
        <section aria-labelledby="install-title" className="border-y border-subtle bg-surface-sunken py-16 sm:py-20">
            <Container className="grid items-center gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div>
                    <SectionTitle id="install-title" text="RoomTrack opens from your home screen, full screen, so the calendar is one tap away when a guest calls. If the internet drops, the calendar you last saw stays readable.">
                        Install it like an app. No store needed.
                    </SectionTitle>
                    <div className="mt-8 grid gap-4 sm:grid-cols-2">
                        {ways.map((way) => (
                            <div key={way.name} className="rounded-card border border-subtle bg-surface p-5">
                                <h3 className="text-body font-semibold">{way.name}</h3>
                                <ol className="mt-2 list-decimal space-y-1 pl-5 text-body-sm text-muted">
                                    {way.steps.map((step) => <li key={step}>{step}</li>)}
                                </ol>
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 flex items-center gap-2 text-caption text-subtle">
                        <WifiOffIcon size={16} className="shrink-0"/>
                        Offline, the calendar is view-only. Changes wait until you are back online.
                    </p>
                </div>
                {/* Not on a phone: the hero already shows this picture there */}
                <img
                    src="/landing/calendar-phone.png"
                    width={357}
                    height={700}
                    loading="lazy"
                    alt="RoomTrack on an iPhone: the calendar with four rooms and their November bookings."
                    className="mx-auto hidden h-auto w-64 sm:block"
                />
            </Container>
        </section>
    );
}

function DemoCard() {
    return (
        // Not on a phone, to keep the page short: the hero and the last band have the same button
        <section aria-labelledby="demo-title" className="hidden py-16 sm:block sm:py-20">
            <Container>
                <div className="grid gap-6 rounded-sheet border border-subtle bg-surface p-6 shadow-card sm:p-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center">
                    <div>
                        <h2 id="demo-title" className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.25rem]">
                            Click around a real, filled-in account.
                        </h2>
                        <p className="mt-3 text-body text-muted">
                            The demo opens your own copy of two sample properties with a season of bookings already
                            running. Add, move and cancel stays to see how it works. No one else sees your changes.
                        </p>
                    </div>
                    <div>
                        <DemoButton/>
                        <p className="mt-3 text-caption text-subtle">No sign-up needed. Your copy is deleted after an hour.</p>
                    </div>
                </div>
            </Container>
        </section>
    );
}

function Pricing() {
    return (
        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 pb-16 sm:pb-20">
            <Container className="grid items-center gap-8 md:grid-cols-2">
                <SectionTitle id="pricing-title" text="No commission per booking, because RoomTrack doesn't take your bookings. It keeps track of them.">
                    One plan. Everything included.
                </SectionTitle>
                <div className="rounded-sheet border-2 border-primary bg-surface p-6 shadow-popover sm:p-8">
                    <p className="text-figure text-primary">Free</p>
                    <ul className="mt-5 space-y-3">
                        {PLAN.map((item) => (
                            <li key={item} className="flex items-start gap-2.5 text-body-sm">
                                <CheckIcon size={18} className="mt-0.5 shrink-0 text-primary"/>
                                {item}
                            </li>
                        ))}
                    </ul>
                    <ButtonLink to="/register" block size="lg" className="mt-7">Create an account</ButtonLink>
                </div>
            </Container>
        </section>
    );
}

function Faq() {
    return (
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 pb-16 sm:pb-20">
            <Container className="max-w-3xl">
                <SectionTitle id="faq-title">Before you sign up.</SectionTitle>
                <div className="mt-8 divide-y divide-(--rt-border-subtle) rounded-card border border-subtle bg-surface">
                    {FAQ.map((item) => (
                        <details key={item.question} className={item.phoneOnly ? "group sm:hidden" : "group"}>
                            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-body font-semibold [&::-webkit-details-marker]:hidden">
                                {item.question}
                                <ChevronDownIcon size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180"/>
                            </summary>
                            <p className="px-5 pb-5 text-body-sm text-muted">{item.answer}</p>
                        </details>
                    ))}
                </div>
            </Container>
        </section>
    );
}

function FinalCall() {
    return (
        <section aria-labelledby="final-title" className="bg-[#0B3B40] py-16 text-white sm:py-20">
            <Container className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
                <div className="max-w-lg">
                    <h2 id="final-title" className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.25rem]">
                        See your whole season on one screen.
                    </h2>
                    <p className="mt-3 text-body text-white/75">
                        {DEMO_ENABLED ? "Start with the demo, or create" : "Create"} your account and add your first
                        room in a few minutes.
                    </p>
                </div>
                {/* Light buttons on the dark band, in both themes: the first one solid white, the others outlined */}
                <div className="flex flex-wrap items-start gap-3">
                    {DEMO_ENABLED && <DemoButton className={ON_DARK_SOLID} errorClassName="text-white"/>}
                    <ButtonLink to="/register" variant="secondary" className={DEMO_ENABLED ? ON_DARK_OUTLINE : ON_DARK_SOLID}>
                        Create an account
                    </ButtonLink>
                    <ButtonLink to="/login" variant="secondary" className={ON_DARK_OUTLINE}>Log in</ButtonLink>
                </div>
            </Container>
        </section>
    );
}

const ON_DARK_SOLID = "border-white! bg-white! text-[#0B3B40]! hover:bg-white/90!";
const ON_DARK_OUTLINE = "border-white/40! bg-transparent! text-white! hover:bg-white/10!";

function Footer() {
    const columns: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
        {
            title: "Product",
            links: [
                {label: "Features", href: "#features"},
                {label: "Video tour", href: "#video-tour"},
                {label: "Pricing", href: "#pricing"},
                {label: "FAQ", href: "#faq"},
            ],
        },
        {
            title: "Account",
            links: [{label: "Log in", to: "/login"}, {label: "Register", to: "/register"}],
        },
        {
            title: "Legal and contact",
            links: [
                {label: "Privacy policy", to: "/privacy"},
                {label: "Terms of service", to: "/terms"},
                {label: "Contact", to: "/contact"},
            ],
        },
    ];
    return (
        <footer className="border-t border-subtle bg-surface pb-[env(safe-area-inset-bottom)]">
            <Container className="grid grid-cols-2 gap-8 py-12 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
                <div className="col-span-2 lg:col-span-1">
                    <p className="flex items-center gap-2 text-title-3 font-bold">
                        <AppLogo size={26}/>
                        RoomTrack
                    </p>
                    <p className="mt-2 max-w-xs text-body-sm text-muted">Reservation management for small accommodation owners.</p>
                </div>
                {columns.map((column) => (
                    <nav key={column.title} aria-label={column.title}>
                        <h2 className="text-label text-fg">{column.title}</h2>
                        <ul className="mt-3 space-y-2 text-body-sm">
                            {column.links.map((link) => (
                                <li key={link.label}>
                                    {link.to
                                        ? <Link to={link.to} className="text-muted hover:text-fg">{link.label}</Link>
                                        : <a href={link.href} className="text-muted hover:text-fg">{link.label}</a>}
                                </li>
                            ))}
                        </ul>
                    </nav>
                ))}
            </Container>
            <Container className="border-t border-subtle py-5 text-caption text-subtle">
                © {new Date().getFullYear()} RoomTrack
            </Container>
        </footer>
    );
}

function PlayIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>
        </svg>
    );
}
