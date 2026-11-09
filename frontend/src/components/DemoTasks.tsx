import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {Link, useLocation} from "react-router-dom";
import {useQueryClient} from "@tanstack/react-query";
import {leaveDemo} from "../lib/demo";
import {completeDemoTask, loadDemoTasks, useDemoTasksDone, watchDemoTasks, type DemoTaskId} from "../lib/demoTasks";
import {useMediaQuery} from "../lib/useMediaQuery";
import Callout from "./ui/Callout";
import {CheckCircleIcon} from "./icons";

const GUIDE_PATH = "/dashboard/help/connect-calendars";
/** How high the list is, so pages can keep their content clear of it. */
const DOCK_HEIGHT = "--rt-demo-dock";
/** From here on the list sits in the sidebar's empty space, where it covers nothing. */
const SIDEBAR_FROM = "(min-width: 1024px)";
const OPEN_MENU = "Tap a booking on the calendar, then open the ⋮ menu at the top";

const TASKS: { id: DemoTaskId; title: string; hint: string }[] = [
    {id: "add", title: "Create a booking", hint: "Tap a free day on the calendar, pick a check-out date, and press Save."},
    {id: "price", title: "Change the price of a booking", hint: "Tap a booking on the calendar, change an amount under Price, and press Save."},
    {id: "dates", title: "Change the dates of a booking", hint: "Tap a booking on the calendar, pick new dates under Stay, and press Save."},
    {id: "guests", title: "Change the number of guests", hint: "Tap a booking on the calendar, use + or − next to Guests, and press Save."},
    {id: "copy", title: "Copy a booking to other rooms", hint: `${OPEN_MENU} and choose Copy. You can pick one room or several.`},
    {id: "move", title: "Move a booking to another room", hint: `${OPEN_MENU} and choose Move.`},
    {id: "cancel", title: "Cancel a booking", hint: `${OPEN_MENU} and choose Cancel.`},
    {
        id: "paid",
        title: "Mark a booking as paid",
        hint: "Stefan Popov's stay in Room A ended about 9 days ago and was never marked as paid. Drag the calendar back "
            + "to find it, tap it, choose Paid under Status, and press Save. Its bar turns green.",
    },
    {id: "room", title: "Add a new room", hint: "Open Properties, choose a property, and press Add room."},
    {id: "restore", title: "Restore a cancelled booking", hint: "Open Cancelled bookings (on a phone, it's under More) and press Restore."},
    {
        id: "doubleBook",
        title: "Try to create a double booking",
        hint: "Cancel a booking, create a new one in the same room on the same dates, then try to restore the cancelled "
            + "one. The app refuses, because those nights are taken now.",
    },
    {id: "export", title: "Export data to an Excel file", hint: "Open Invoices, choose a property, and press Download Excel."},
    {
        id: "guide",
        title: "See how connecting Booking.com works",
        hint: "Connecting a real calendar is for registered accounts only, but you can read how it works: open Channel "
            + "setup guide in the menu (on a phone: More, then Connect Booking.com).",
    },
];

const PARTS = [TASKS.slice(0, 5), TASKS.slice(5, 10), TASKS.slice(10)];
// A phone has little room to spare: 3 at a time
const PHONE_PARTS = Array.from({length: Math.ceil(TASKS.length / 3)}, (_, i) => TASKS.slice(i * 3, i * 3 + 3));

/**
 * Demo only: the things to try, always on screen on every page, a few at a time: the next part appears when one is
 * finished, and after the last only the invitation to register stays. Visitors try on their own first, which shows
 * whether the app explains itself, so the instructions stay behind a Hint button. Tasks tick themselves when really
 * done (lib/demoTasks.ts). On a phone form, where the keyboard and Save bar need the room, only the next task shows.
 */
export default function DemoTasks({email, onForm}: { email: string; onForm: boolean }) {
    const queryClient = useQueryClient();
    const {pathname} = useLocation();
    const done = useDemoTasksDone();
    const [hintsOpen, setHintsOpen] = useState<ReadonlySet<DemoTaskId>>(new Set());
    const inSidebar = useMediaQuery(SIDEBAR_FROM);
    const isPhone = useMediaQuery("(max-width: 639px)");
    const parts = isPhone ? PHONE_PARTS : PARTS;
    const dock = useRef<HTMLElement>(null);
    const partIndex = parts.findIndex((part) => part.some((task) => !done.has(task.id)));
    const part = parts[partIndex];
    const nextOnly = onForm && !inSidebar;
    const shownTasks = !part ? [] : nextOnly ? part.filter((task) => !done.has(task.id)).slice(0, 1) : part;

    useLayoutEffect(() => loadDemoTasks(email), [email]);
    useLayoutEffect(() => {
        const element = dock.current;
        if (!element) return;
        const style = document.documentElement.style;
        const observer = new ResizeObserver(() => style.setProperty(DOCK_HEIGHT,
            window.matchMedia(SIDEBAR_FROM).matches ? "0px" : `${element.offsetHeight}px`));
        observer.observe(element);
        return () => {
            observer.disconnect();
            style.removeProperty(DOCK_HEIGHT);
        };
    }, []);
    useEffect(() => watchDemoTasks(queryClient), [queryClient]);
    useEffect(() => {
        if (pathname.startsWith(GUIDE_PATH)) completeDemoTask("guide");
    }, [pathname, email]);

    function toggleHint(id: DemoTaskId) {
        setHintsOpen((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
        });
    }

    return (
        <section
            ref={dock}
            aria-label="Things to try"
            className={`fixed inset-x-0 z-(--rt-z-sticky) border-t border-subtle bg-surface sm:right-6 sm:left-auto sm:w-[21rem] sm:rounded-card sm:border sm:shadow-popover lg:top-[16.5rem] lg:right-auto lg:bottom-auto lg:left-3 lg:z-(--rt-z-nav) lg:w-[14.5rem] lg:bg-surface-sunken lg:shadow-none ${
                onForm
                    ? "bottom-[calc(4.8rem+env(safe-area-inset-bottom))] sm:bottom-24"
                    : "bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] sm:bottom-6"
            }`}
        >
            {!part ? (
                <Callout tone="success" title="You've tried the main features" className="m-2 max-sm:m-1 max-sm:gap-2 max-sm:px-2.5 max-sm:py-1.5 max-sm:text-[13px] max-sm:leading-[1.15rem]">
                    <Link to="/register" onClick={() => leaveDemo(queryClient)} className="link">
                        Create your own account
                    </Link>{" "}
                    to keep your data.
                </Callout>
            ) : (
                <>
                    {!nextOnly && (
                        <div className="flex min-h-9 items-center justify-between gap-2 px-4 pt-1.5 sm:pt-2.5 lg:px-3 max-sm:min-h-0 max-sm:px-3 max-sm:pt-1">
                            <h2 className="text-body-sm font-bold text-fg max-sm:text-[13px]">Try it: part {partIndex + 1} of {parts.length}</h2>
                            <p role="status" className="text-caption text-muted">
                                {part.filter((task) => done.has(task.id)).length} of {part.length} done
                            </p>
                        </div>
                    )}
                    <ol key={partIndex} className="max-h-[45dvh] animate-pop-in overflow-y-auto px-4 pb-1 lg:max-h-[calc(100dvh-37rem)] lg:min-h-20 lg:px-3 max-sm:px-3 max-sm:pb-0.5">
                        {shownTasks.map((task) => {
                            const isDone = done.has(task.id);
                            const hintOpen = hintsOpen.has(task.id) && !isDone;
                            const hintId = `demo-hint-${task.id}`;
                            return (
                                <li key={task.id}>
                                    <div className="flex min-h-10 items-center gap-2.5 max-sm:min-h-7 max-sm:gap-2">
                                        {isDone
                                            ? <CheckCircleIcon size={18} className="shrink-0 text-success max-sm:size-4"/>
                                            : <span className="size-[1.125rem] shrink-0 rounded-full border-2 border-default max-sm:size-4"/>}
                                        <p className={`min-w-0 flex-1 text-body-sm font-semibold lg:text-[13px] lg:leading-[1.15rem] max-sm:text-[13px] max-sm:leading-[1.15rem] ${isDone ? "text-muted line-through" : "text-fg"}`}>
                                            {task.title}
                                            {isDone && <span className="sr-only"> (done)</span>}
                                        </p>
                                        {!isDone && (
                                            <button type="button" onClick={() => toggleHint(task.id)}
                                                    aria-expanded={hintOpen} aria-controls={hintId}
                                                    className="link inline-flex min-h-10 shrink-0 items-center px-1 text-body-sm max-sm:min-h-7 max-sm:text-[13px]">
                                                {hintOpen ? "Hide hint" : "Hint"}
                                            </button>
                                        )}
                                    </div>
                                    <p id={hintId} hidden={!hintOpen} className="pb-2 pl-7 text-body-sm text-muted max-sm:pb-1 max-sm:pl-6 max-sm:text-[13px] max-sm:leading-[1.15rem]">{task.hint}</p>
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}
        </section>
    );
}
