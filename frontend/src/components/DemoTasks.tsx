import {useEffect, useState} from "react";
import {Link, useLocation} from "react-router-dom";
import {useQueryClient} from "@tanstack/react-query";
import {leaveDemo} from "../lib/demo";
import {completeDemoTask, loadDemoTasks, useDemoTasksDone, watchDemoTasks, type DemoTaskId} from "../lib/demoTasks";
import Callout from "./ui/Callout";
import Sheet from "./ui/Sheet";
import {CheckCircleIcon} from "./icons";

const GUIDE_PATH = "/dashboard/help/connect-calendars";
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

/**
 * Demo only: a small button on every page that opens a checklist of things to try. Visitors try on their own first,
 * which shows whether the app explains itself, so the instructions stay behind a Hint button. Tasks tick themselves
 * when really done (lib/demoTasks.ts). The button is hidden on phone forms, where the Save bar takes its place.
 */
export default function DemoTasks({email, hiddenOnPhone}: { email: string; hiddenOnPhone: boolean }) {
    const queryClient = useQueryClient();
    const {pathname} = useLocation();
    const done = useDemoTasksDone();
    const [open, setOpen] = useState(false);
    const [hintsOpen, setHintsOpen] = useState<ReadonlySet<DemoTaskId>>(new Set());
    const allDone = TASKS.every((task) => done.has(task.id));
    // What's left to try stays on top; each group keeps the checklist's order
    const orderedTasks = [...TASKS.filter((task) => !done.has(task.id)), ...TASKS.filter((task) => done.has(task.id))];

    useEffect(() => loadDemoTasks(email), [email]);
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
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                className={`${hiddenOnPhone ? "hidden sm:inline-flex" : "inline-flex"} fixed bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+1rem)] left-4 z-(--rt-z-sticky) min-h-11 items-center gap-2 rounded-full border px-4 text-body-sm font-semibold shadow-popover sm:right-6 sm:bottom-6 sm:left-auto ${
                    allDone ? "animate-pulse-ring border-transparent bg-success-solid text-on-success-solid" : "border-default bg-surface text-fg"
                }`}
            >
                <CheckCircleIcon size={18} className={allDone ? undefined : "text-primary"}/>
                {allDone ? "Congratulations" : `Try it: ${TASKS.filter((task) => done.has(task.id)).length} of ${TASKS.length}`}
            </button>

            <Sheet open={open} onClose={() => setOpen(false)} title="Things to try" showClose closeLabel="Close"
                   description="See if you can work out each one yourself. It ticks itself when you do it. Stuck? Press Hint.">
                {allDone && (
                    <Callout tone="success" title="You've tried the main features" className="mb-4">
                        <Link to="/register" onClick={() => leaveDemo(queryClient)} className="link">
                            Create your own account
                        </Link>{" "}
                        to keep your data.
                    </Callout>
                )}
                <ol className="divide-y divide-subtle">
                    {orderedTasks.map((task) => {
                        const isDone = done.has(task.id);
                        const hintOpen = hintsOpen.has(task.id) && !isDone;
                        const hintId = `demo-hint-${task.id}`;
                        return (
                            <li key={task.id} className="flex gap-3 py-1.5">
                                <span className="flex size-11 shrink-0 items-center justify-center">
                                    {isDone
                                        ? <CheckCircleIcon size={20} className="text-success"/>
                                        : <span className="size-[1.125rem] rounded-full border-2 border-default"/>}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-h-11 items-center justify-between gap-2">
                                        <p className={`min-w-0 text-body-sm font-semibold ${isDone ? "text-muted line-through" : "text-fg"}`}>
                                            {task.title}
                                            {isDone && <span className="sr-only"> (done)</span>}
                                        </p>
                                        {!isDone && (
                                            <button type="button" onClick={() => toggleHint(task.id)}
                                                    aria-expanded={hintOpen} aria-controls={hintId}
                                                    className="link inline-flex min-h-11 shrink-0 items-center px-1 text-body-sm">
                                                {hintOpen ? "Hide hint" : "Hint"}
                                            </button>
                                        )}
                                    </div>
                                    <p id={hintId} hidden={!hintOpen} className="pb-2 text-body-sm text-muted">{task.hint}</p>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </Sheet>
        </>
    );
}
