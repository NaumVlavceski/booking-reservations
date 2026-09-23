import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {format, addDays, differenceInCalendarDays} from "date-fns";
import {DayPicker} from "react-day-picker";
import "react-day-picker/style.css";
import {getProperties} from "../lib/api/properties";
import {getUnitsForProperty} from "../lib/api/units";
import {getReservations} from "../lib/api/reservations";
const MAX_RANGE_DAYS = 5 * 365;
const CHUNK = 20;
const BUFFER_CHUNKS = 1;

const SOURCE_COLORS: Record<string, { fill: string; border: string; text: string; label: string }> = {
    DIRECT: {fill: "#b3aa7a", border: "#87641d", text: "#92400E", label: "Direct"},
    MANUAL_BLOCK: {fill: "#E5E7EB", border: "#9CA3AF", text: "#374151", label: "Blocked"},
    BOOKING_COM: {fill: "#DBEAFE", border: "#60A5FA", text: "#1E40AF", label: "Booking.com"},
    AIRBNB: {fill: "#FFE1E6", border: "#FB7185", text: "#9F1239", label: "Airbnb"},
};

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export default function CalendarPage() {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const innerRef = useRef<HTMLDivElement>(null); // the transformed grid — moved via direct DOM writes, not React state
    const monthLabelRef = useRef<HTMLDivElement>(null); // sticky "current month" label — text written directly, not via React state
    const currentMonthKeyRef = useRef<string>("");
    const today = useMemo(() => startOfToday(), []);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
    const [viewportWidth, setViewportWidth] = useState(() =>
        Math.max(300, window.innerWidth - (window.innerWidth < 640 ? 112 : 220) - 48)
    );
    const [isDragging, setIsDragging] = useState(false);

    const [windowState, setWindowState] = useState({start: 0, end: 0});
    const windowRef = useRef(windowState);
    windowRef.current = windowState;

    const scrollXRef = useRef(0);

    const dragRef = useRef<{ startX: number; startScroll: number; pointerId: number } | null>(null);
    const velocityRef = useRef(0);
    const lastMoveRef = useRef<{ t: number; x: number } | null>(null);
    const momentumFrameRef = useRef<number | null>(null);

    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const datePickerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onResize() {
            setIsMobile(window.innerWidth < 640);
        }

        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Callback ref: fires exactly when the grid's viewport div mounts or
    // unmounts, regardless of conditional rendering (loading states, etc.)
    // — unlike a plain ref + useEffect, this can't miss the element
    // appearing after an async data fetch resolves.
    const setViewportRef = useCallback((node: HTMLDivElement | null) => {
        if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
        }
        viewportRef.current = node;
        if (node) {
            setViewportWidth(node.clientWidth);
            const observer = new ResizeObserver((entries) => {
                setViewportWidth(entries[0].contentRect.width);
            });
            observer.observe(node);
            resizeObserverRef.current = observer;
        }
    }, []);

    useEffect(() => {
        return () => {
            if (momentumFrameRef.current) cancelAnimationFrame(momentumFrameRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isDatePickerOpen) return;

        function onPointerDownOutside(e: PointerEvent) {
            if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
                setIsDatePickerOpen(false);
            }
        }

        document.addEventListener("pointerdown", onPointerDownOutside);
        return () => document.removeEventListener("pointerdown", onPointerDownOutside);
    }, [isDatePickerOpen]);

    // Desktop: size columns so exactly 20 days fill the viewport width,
    // rather than a fixed px width that fits however many days happen to fit.
    const DAY_COL_WIDTH = isMobile ? 46 : Math.max(40, Math.floor(viewportWidth / 20));
    const ROW_HEIGHT = isMobile ? 52 : 64;
    const BAR_HEIGHT = isMobile ? 48 : 60;
    const BAR_MARGIN = 5;
    const LABEL_WIDTH = isMobile ? 112 : 220;
    const HEADER_H1 = 26;
    const HEADER_H2 = isMobile ? 38 : 48;
    // Full cell width — the diagonal runs corner to corner of the
    // check-in/check-out day's own square, not a small corner nick.
    const CUT_PX = DAY_COL_WIDTH;

    const {data: properties} = useQuery({queryKey: ["properties"], queryFn: getProperties});
    const {data: units} = useQuery({
        queryKey: ["units", "all"],
        queryFn: async () => {
            if (!properties) return [];
            const perProperty = await Promise.all(properties.map((p) => getUnitsForProperty(p.id)));
            return perProperty.flat();
        },
        enabled: !!properties,
    });
    const {data: reservations} = useQuery({
        queryKey: ["reservations", "calendar"],
        queryFn: () => getReservations(),
    });

    const maxScroll = MAX_RANGE_DAYS * DAY_COL_WIDTH;

    function clampScroll(v: number) {
        return Math.min(Math.max(v, -maxScroll), maxScroll);
    }

    function computeWindow(scrollXPx: number) {
        const visibleDayCount = Math.max(1, Math.ceil((viewportWidth || 300) / DAY_COL_WIDTH));
        const centerIndex = scrollXPx / DAY_COL_WIDTH;
        const snappedStart = Math.floor(centerIndex / CHUNK) * CHUNK - CHUNK * BUFFER_CHUNKS;
        const spanChunks = Math.ceil(visibleDayCount / CHUNK) + BUFFER_CHUNKS * 2;
        return {start: snappedStart, end: snappedStart + spanChunks * CHUNK};
    }

    // The month label is pinned to the viewport's left edge (outside the
    // scrolling grid) and always reflects whichever day currently sits
    // under that edge — so it stays on "January" the whole time you're
    // browsing January, instead of jumping with a per-day column label.
    function updateMonthLabel(scrollXPx: number) {
        const leftDayIndex = Math.round(scrollXPx / DAY_COL_WIDTH);
        const label = format(addDays(today, leftDayIndex), "MMMM yyyy");
        if (label !== currentMonthKeyRef.current) {
            currentMonthKeyRef.current = label;
            if (monthLabelRef.current) monthLabelRef.current.textContent = label;
        }
    }

    // The single function that moves the calendar, called every drag frame
    // and every momentum frame. Writes the transform directly to the DOM
    // (smooth, no re-render) and only calls setWindowState when the
    // rendered day-window actually needs to shift (rare, real re-render).
    function applyScroll(rawScrollX: number) {
        const clamped = clampScroll(rawScrollX);
        scrollXRef.current = clamped;
        updateMonthLabel(clamped);

        const w = windowRef.current;
        if (clamped < w.start * DAY_COL_WIDTH + CHUNK * DAY_COL_WIDTH * 0.5 ||
            clamped > w.end * DAY_COL_WIDTH - CHUNK * DAY_COL_WIDTH * 0.5) {
            const next = computeWindow(clamped);
            if (next.start !== w.start || next.end !== w.end) {
                windowRef.current = next;
                setWindowState(next);
            }
        }

        if (innerRef.current) {
            innerRef.current.style.transform = `translateX(${windowRef.current.start * DAY_COL_WIDTH - clamped}px)`;
        }
    }

    // Initial mount and any time DAY_COL_WIDTH changes (mobile breakpoint
    // flip): (re)compute the window and snap the transform, preserving
    // whatever scroll position we're already at.
    useLayoutEffect(() => {
        if (!viewportWidth) return;
        const next = computeWindow(scrollXRef.current);
        windowRef.current = next;
        setWindowState(next);
        if (innerRef.current) {
            innerRef.current.style.transform = `translateX(${next.start * DAY_COL_WIDTH - scrollXRef.current}px)`;
        }
        updateMonthLabel(scrollXRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewportWidth, DAY_COL_WIDTH]);

    function onPointerDown(e: ReactPointerEvent) {
        if (momentumFrameRef.current) {
            cancelAnimationFrame(momentumFrameRef.current);
            momentumFrameRef.current = null;
        }
        velocityRef.current = 0;
        setIsDragging(true);
        dragRef.current = {startX: e.clientX, startScroll: scrollXRef.current, pointerId: e.pointerId};
        lastMoveRef.current = {t: performance.now(), x: scrollXRef.current};
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: ReactPointerEvent) {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = e.clientX - drag.startX;
        const target = drag.startScroll - delta;
        applyScroll(target);

        const now = performance.now();
        const last = lastMoveRef.current;
        if (last) {
            const dt = now - last.t;
            if (dt > 0) {
                const instVelocity = (scrollXRef.current - last.x) / dt;
                velocityRef.current = velocityRef.current * 0.7 + instVelocity * 0.3;
            }
        }
        lastMoveRef.current = {t: now, x: scrollXRef.current};
    }

    function onPointerUp(e: ReactPointerEvent) {
        if (dragRef.current) {
            (e.target as HTMLElement).releasePointerCapture(dragRef.current.pointerId);
        }
        dragRef.current = null;
        setIsDragging(false);

        const MIN_VELOCITY = 0.03;
        if (Math.abs(velocityRef.current) > MIN_VELOCITY) {
            startMomentum();
        }
    }

    function startMomentum() {
        let lastT = performance.now();

        function step(now: number) {
            const dt = now - lastT;
            lastT = now;

            velocityRef.current *= Math.exp(-dt / 250);

            if (Math.abs(velocityRef.current) < 0.02) {
                momentumFrameRef.current = null;
                return;
            }

            const target = scrollXRef.current + velocityRef.current * dt;
            const clamped = clampScroll(target);
            if (clamped !== target) velocityRef.current = 0;
            applyScroll(clamped);

            momentumFrameRef.current = requestAnimationFrame(step);
        }

        momentumFrameRef.current = requestAnimationFrame(step);
    }

    function handleJumpToDate(date: Date | undefined) {
        if (!date) return;
        if (momentumFrameRef.current) {
            cancelAnimationFrame(momentumFrameRef.current);
            momentumFrameRef.current = null;
        }
        velocityRef.current = 0;
        const dayIndex = differenceInCalendarDays(date, today);
        applyScroll(dayIndex * DAY_COL_WIDTH);
        setIsDatePickerOpen(false);
    }

    const renderedDays = useMemo(() => {
        const list = [];
        for (let i = windowState.start; i < windowState.end; i++) {
            const date = addDays(today, i);
            const weekday = date.getDay();
            list.push({
                index: i,
                date,
                dateStr: format(date, "yyyy-MM-dd"),
                dayNum: date.getDate(),
                weekdayLabel: format(date, "EEE"),
                isWeekend: weekday === 0 || weekday === 6,
                isToday: i === 0,
            });
        }
        return list;
    }, [windowState, today]);

    const windowColCount = windowState.end - windowState.start;

    // Sorted by id, not the order the API happens to return — that order can
    // shift after an edit (e.g. if the backend orders by updated_at), which
    // would otherwise move a unit's row every time its name/capacity changes.
    const rows = useMemo(() => {
        const sorted = [...(units ?? [])].sort((a, b) => a.id.localeCompare(b.id));
        return sorted.map((u, i) => ({unit: u, gridRow: i + 3}));
    }, [units]);

    // Reservation bars. The visual bar extends ONE day past the real
    // checkout date — that extra cell is purely a rendering choice, giving
    // the checkout diagonal a square to live in. The underlying date range
    // stored in the database, and the exclusion constraint, are untouched.
    const bars = useMemo(() => {
        if (!reservations || !units) return [];
        const rowIndexByUnit = new Map(rows.map((r) => [r.unit.id, r.gridRow]));

        return reservations
            .filter((r) => r.status === "CONFIRMED")
            .map((r) => {
                const gridRow = rowIndexByUnit.get(r.unitId);
                if (!gridRow) return null;

                const startIdx = differenceInCalendarDays(parseLocalDate(r.checkIn), today);
                const endIdx = differenceInCalendarDays(parseLocalDate(r.checkOut), today);
                const visualEndIdx = endIdx + 1;

                if (visualEndIdx <= windowState.start || startIdx >= windowState.end) return null;

                const clampedStart = Math.max(windowState.start, startIdx);
                const clampedEnd = Math.min(windowState.end, visualEndIdx);

                const trueLeft = startIdx >= windowState.start;
                const trueRight = visualEndIdx <= windowState.end;

                const colors = SOURCE_COLORS[r.source] ?? SOURCE_COLORS.DIRECT;
                const colStart = clampedStart - windowState.start + 1;
                const colEnd = clampedEnd - windowState.start + 1;

                const W = (colEnd - colStart) * DAY_COL_WIDTH - 2 * BAR_MARGIN;
                const H = BAR_HEIGHT;
                const points = trueLeft && trueRight
                    ? `${CUT_PX},0 ${W},0 ${W - CUT_PX},${H} 0,${H}`
                    : trueLeft
                        ? `${CUT_PX},0 ${W},0 ${W},${H} 0,${H}`
                        : trueRight
                            ? `0,0 ${W},0 ${W - CUT_PX},${H} 0,${H}`
                            : `0,0 ${W},0 ${W},${H} 0,${H}`;

                return {
                    id: r.id,
                    gridColumn: `${colStart} / ${colEnd}`,
                    gridRow: `${gridRow} / ${gridRow + 1}`,
                    fill: colors.fill,
                    borderColor: colors.border,
                    textColor: colors.text,
                    points,
                    W,
                    H,
                    guestName: r.guestName || "Reservation",
                };
            })
            .filter((b): b is NonNullable<typeof b> => b !== null);
    }, [reservations, units, rows, today, windowState, CUT_PX, DAY_COL_WIDTH, BAR_HEIGHT, BAR_MARGIN]);

    const todayColIndex = renderedDays.findIndex((d) => d.isToday);
    const isLoading = !properties || !units;

    return (
        <div>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16}}>
                <h1 style={{fontSize: 22, fontWeight: 700, margin: 0}}>Calendar</h1>
                <div style={{display: "flex", alignItems: "center", gap: 16}}>
                    {Object.values(SOURCE_COLORS).map((c) => (
                        <div key={c.label} style={{display: "flex", alignItems: "center", gap: 6}}>
                            <div style={{width: 10, height: 10, borderRadius: 3, background: c.fill}}/>
                            <span style={{fontSize: 12, color: "#4B5563", fontWeight: 500}}>{c.label}</span>
                        </div>
                    ))}
                    <div ref={datePickerRef} style={{position: "relative"}}>
                        <button
                            type="button"
                            onClick={() => setIsDatePickerOpen((v) => !v)}
                            title="Jump to date"
                            aria-label="Jump to date"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 32,
                                height: 32,
                                border: "1px solid #E4E7EC",
                                borderRadius: 8,
                                background: isDatePickerOpen ? "#F0FDFA" : "#fff",
                                cursor: "pointer",
                                color: "#374151",
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                        </button>

                        {isDatePickerOpen && (
                            <div
                                style={{
                                    position: "absolute",
                                    top: "calc(100% + 8px)",
                                    right: 0,
                                    zIndex: 20,
                                    background: "#fff",
                                    border: "1px solid #E4E7EC",
                                    borderRadius: 12,
                                    boxShadow: "0 8px 24px rgba(16,19,26,0.12)",
                                    padding: 8,
                                    ["--rdp-accent-color" as string]: "#0F766E",
                                    ["--rdp-accent-background-color" as string]: "#CCFBF1",
                                    ["--rdp-today-color" as string]: "#0F766E",
                                }}
                            >
                                <DayPicker
                                    mode="single"
                                    selected={undefined}
                                    onSelect={handleJumpToDate}
                                    defaultMonth={today}
                                    disabled={{before: addDays(today, -MAX_RANGE_DAYS), after: addDays(today, MAX_RANGE_DAYS)}}
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div style={{color: "#6B7280"}}>Loading calendar...</div>
            ) : units && units.length === 0 ? (
                <div style={{
                    textAlign: "center",
                    padding: "64px 0",
                    background: "#fff",
                    border: "1px solid #E4E7EC",
                    borderRadius: 12
                }}>
                    <p style={{color: "#4B5563", marginBottom: 16}}>No units yet — add a property and a unit to see your
                        calendar.</p>
                    <Link to="/dashboard/properties/new" style={{color: "#0F766E", fontWeight: 600}}>
                        Add a property
                    </Link>
                </div>
            ) : (
                <div style={{
                    display: "flex",
                    border: "1px solid #E4E7EC",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#fff"
                }}>
                    <div style={{width: LABEL_WIDTH, flexShrink: 0, borderRight: "1px solid #E4E7EC"}}>
                        <div style={{
                            height: HEADER_H1 + HEADER_H2,
                            borderBottom: "1px solid #E4E7EC",
                            display: "flex",
                            alignItems: "flex-end",
                            padding: "0 0 8px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#9AA1AE"
                        }}>
                            Units ({units?.length ?? 0})
                        </div>
                        {rows.map(({unit}) => (
                            <Link
                                key={unit.id}
                                to={`/dashboard/properties/${unit.propertyId}/units/${unit.id}`}
                                style={{
                                    height: ROW_HEIGHT,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                    padding: "0 12px",
                                    textDecoration: "none",
                                    color: "inherit",
                                    borderBottom: "1px solid #EEF0F3",
                                }}
                            >
                                <div style={{
                                    fontSize: isMobile ? 12 : 14,
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}>
                                    {unit.name}
                                </div>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 11,
                                    color: "#6B7280",
                                    marginTop: 2
                                }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21a8 8 0 0 0-16 0"/>
                                        <circle cx="12" cy="7" r="4"/>
                                    </svg>
                                    {unit.capacity}
                                </div>
                            </Link>
                        ))}
                    </div>

                    <div
                        ref={setViewportRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        style={{
                            flex: 1,
                            overflow: "hidden",
                            position: "relative",
                            touchAction: "none",
                            cursor: isDragging ? "grabbing" : "grab"
                        }}
                    >
                        {/* Sticky month label — sits outside the scrolling grid so it
                            stays fixed on the current month instead of scrolling with
                            the days; its text is written directly via monthLabelRef. */}
                        <div
                            ref={monthLabelRef}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                height: HEADER_H1,
                                zIndex: 2,
                                display: "flex",
                                alignItems: "center",
                                width: "max-content",
                                padding: "0 10px 0 6px",
                                background: "#fff",
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                                color: "#9AA1AE",
                                pointerEvents: "none",
                            }}
                        >
                            {format(today, "MMMM yyyy")}
                        </div>

                        <div
                            ref={innerRef}
                            style={{
                                width: windowColCount * DAY_COL_WIDTH,
                                display: "grid",
                                gridTemplateColumns: `repeat(${windowColCount}, ${DAY_COL_WIDTH}px)`,
                                gridTemplateRows: `${HEADER_H1}px ${HEADER_H2}px repeat(${units?.length ?? 0}, ${ROW_HEIGHT}px)`,
                                willChange: "transform",
                            }}
                        >
                            <div style={{
                                gridColumn: `1 / ${windowColCount + 1}`,
                                gridRow: "1 / 3",
                                background: "#fff",
                                borderBottom: "1px solid #E4E7EC"
                            }}/>

                            {renderedDays.map((d, i) => (
                                <div
                                    key={"bg-" + d.index}
                                    style={{
                                        gridColumn: `${i + 1} / ${i + 2}`,
                                        gridRow: `3 / ${(units?.length ?? 0) + 3}`,
                                        borderRight: "1px solid #E4E7EC",
                                        background: d.isToday ? "#CCFBF1" : d.isWeekend ? "#EEF1F5" : "transparent",
                                        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent ${ROW_HEIGHT - 1}px, #E9EBEF ${ROW_HEIGHT - 1}px, #E9EBEF ${ROW_HEIGHT}px)`,
                                    }}
                                />
                            ))}

                            {todayColIndex >= 0 && (
                                <div
                                    style={{
                                        gridColumn: `${todayColIndex + 1} / ${todayColIndex + 2}`,
                                        gridRow: "1 / 3",
                                        background: "#0F766E",
                                        borderRadius: 6,
                                        margin: "28px 2px 2px 2px",
                                    }}
                                />
                            )}

                            {renderedDays.map((d, i) => (
                                <div
                                    key={"h-" + d.index}
                                    style={{
                                        gridColumn: `${i + 1} / ${i + 2}`,
                                        gridRow: "2 / 3",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderRight: "1px solid #E4E7EC",
                                        borderTop: "1px solid #E4E7EC",
                                    }}
                                >
                                    <div style={{
                                        fontSize: isMobile ? 12 : 14,
                                        fontWeight: d.isToday ? 700 : 600,
                                        color: d.isToday ? "#fff" : "#1A1D23"
                                    }}>
                                        {d.dayNum}
                                    </div>
                                    <div style={{
                                        fontSize: isMobile ? 9 : 11,
                                        fontWeight: 500,
                                        color: d.isToday ? "#CCFBF1" : "#9AA1AE"
                                    }}>
                                        {d.weekdayLabel}
                                    </div>
                                </div>
                            ))}

                            {rows.map(({unit, gridRow}) =>
                                renderedDays.map((d, i) => (
                                    <Link
                                        key={unit.id + "-" + d.index}
                                        to={`/dashboard/reservations/new?unitId=${unit.id}&checkIn=${d.dateStr}`}
                                        style={{
                                            gridColumn: `${i + 1} / ${i + 2}`,
                                            gridRow: `${gridRow} / ${gridRow + 1}`
                                        }}
                                        aria-label={`New reservation, ${unit.name}, ${d.dateStr}`}
                                    />
                                ))
                            )}

                            {bars.map((b) => (
                                <Link
                                    key={b.id}
                                    to={`/dashboard/reservations/${b.id}`}
                                    style={{
                                        gridColumn: b.gridColumn,
                                        gridRow: b.gridRow,
                                        alignSelf: "center",
                                        position: "relative",
                                        display: "block",
                                        width: b.W,
                                        height: b.H,
                                        textDecoration: "none",
                                        overflow: "hidden",
                                    }}
                                >
                                    <svg
                                        width={b.W}
                                        height={b.H}
                                        style={{
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            filter: "drop-shadow(0 1px 2px rgba(16,19,26,0.06))",
                                        }}
                                    >
                                        <polygon
                                            points={b.points}
                                            fill={b.fill}
                                            stroke={b.borderColor}
                                            strokeWidth={1.5}
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                    <span
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            padding: "0 12px",
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: b.textColor,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            textAlign: "center",
                                            pointerEvents: "none",
                                        }}
                                    >
                                        {b.guestName}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div style={{display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12}}>
                <span style={{fontSize: 12, color: "#9AA1AE"}}>← Drag to browse dates →</span>
            </div>
        </div>
    );
}