import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import type {MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent} from "react";
import {Link, useNavigate} from "react-router-dom";
import {useIsFetching, useQuery, useQueryClient} from "@tanstack/react-query";
import {format, addDays, differenceInCalendarDays} from "date-fns";
import {DayPicker} from "react-day-picker";
import "react-day-picker/style.css";
import {propertiesQuery, type PropertyResponse} from "../lib/api/properties";
import {allUnitsQuery, type UnitResponse} from "../lib/api/units";
import {allReservationsQuery} from "../lib/api/reservations";
import {addUnitPath, useActiveProperty} from "../lib/useActiveProperty";
import {useFromHere} from "../lib/useReturnTo";
import {BedIcon, CalendarIcon, MoreVerticalIcon, PersonIcon, PlusIcon, RefreshIcon} from "../components/icons";
import "./CalendarPage.css";

const MAX_RANGE_DAYS = 5 * 365;
const CHUNK = 20;
const BUFFER_CHUNKS = 1;

// Confirmed reservations are colored by where they came from.
const SOURCE_COLORS: Record<string, { fill: string; border: string; text: string; label: string }> = {
    DIRECT: {fill: "#b3aa7a", border: "#87641d", text: "#92400E", label: "Direct"},
    BOOKING: {fill: "#DBEAFE", border: "#60A5FA", text: "#1E40AF", label: "Booking.com"},
    AIRBNB: {fill: "#FFE1E6", border: "#FB7185", text: "#9F1239", label: "Airbnb"},
};

// PAID and BLOCK statuses override the source color — they need to stand
// out regardless of where the reservation came from.
const STATUS_COLORS: Record<string, { fill: string; border: string; text: string; label: string }> = {
    PAID: {fill: "#D1FAE5", border: "#34D399", text: "#065F46", label: "Paid"},
    BLOCK: {fill: "#E5E7EB", border: "#9CA3AF", text: "#374151", label: "Blocked"},
};

const MOBILE_VISIBLE_DAYS = 7;
// Movement under this is a tap (open a new reservation), over it is a drag.
const DRAG_THRESHOLD_PX = 5;
const COLLAPSED_KEY = "staytrack.calendar.collapsedProperties";

type PropertyGroup = { property: PropertyResponse; units: UnitResponse[] };
type LayoutRow =
    | { kind: "group"; group: PropertyGroup; collapsed: boolean; gridRow: number; top: number; height: number }
    | { kind: "unit"; unit: UnitResponse; gridRow: number; top: number; height: number };

function readCollapsed(): Set<string> {
    try {
        return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
    } catch {
        return new Set();
    }
}

// Creation order keeps auto-created "Room 1..N" in sequence and doesn't move
// a row when it's renamed; numeric name compare breaks same-timestamp ties.
function compareUnits(a: UnitResponse, b: UnitResponse) {
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
        || a.name.localeCompare(b.name, undefined, {numeric: true})
        || a.id.localeCompare(b.id);
}

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
        Math.max(260, window.innerWidth - (window.innerWidth < 640 ? 104 : 120 + 48))
    );

    const [windowState, setWindowState] = useState({start: 0, end: 0});
    const windowRef = useRef(windowState);
    windowRef.current = windowState;

    const scrollXRef = useRef(0);

    const dragRef = useRef<{ startX: number; startScroll: number; pointerId: number; moved: boolean } | null>(null);
    const suppressClickRef = useRef(false);
    const navigate = useNavigate();
    const velocityRef = useRef(0);
    const lastMoveRef = useRef<{ t: number; x: number } | null>(null);
    const momentumFrameRef = useRef<number | null>(null);

    const [openMenu, setOpenMenu] = useState<"date" | "more" | null>(null);
    const datePickerRef = useRef<HTMLDivElement | null>(null);
    const moreMenuRef = useRef<HTMLDivElement | null>(null);

    const queryClient = useQueryClient();
    const isFetching = useIsFetching() > 0;
    const activeProperty = useActiveProperty();
    const fromHere = useFromHere();
    const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

    function saveCollapsed(next: Set<string>) {
        setCollapsed(next);
        try {
            localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
        } catch {
            // Preference just won't persist across reloads.
        }
    }

    function toggleGroup(propertyId: string) {
        const next = new Set(collapsed);
        if (next.has(propertyId)) next.delete(propertyId);
        else next.add(propertyId);
        saveCollapsed(next);
    }

    useEffect(() => {
        function onResize() {
            setIsMobile(window.innerWidth < 640);
        }

        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

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
        if (!openMenu) return;
        const anchor = openMenu === "date" ? datePickerRef.current : moreMenuRef.current;

        function onPointerDownOutside(e: PointerEvent) {
            if (anchor && !anchor.contains(e.target as Node)) setOpenMenu(null);
        }

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpenMenu(null);
        }

        document.addEventListener("pointerdown", onPointerDownOutside);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDownOutside);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [openMenu]);

    function toggleMenu(menu: "date" | "more") {
        setOpenMenu((current) => (current === menu ? null : menu));
    }

    function handleRefresh() {
        queryClient.invalidateQueries({queryKey: ["properties"]});
        queryClient.invalidateQueries({queryKey: ["units"]});
        queryClient.invalidateQueries({queryKey: ["reservations"]});
    }

    // Phones: exactly a week fills the width. Desktop: 20 days.
    const DAY_COL_WIDTH = isMobile
        ? Math.max(30, viewportWidth / MOBILE_VISIBLE_DAYS)
        : Math.max(40, Math.floor(viewportWidth / 20));
    const ROW_HEIGHT = isMobile ? 56 : 64;
    const GROUP_HEIGHT = isMobile ? 48 : 52;
    const BAR_HEIGHT = isMobile ? 44 : 60;
    const BAR_MARGIN = isMobile ? 3 : 5;
    const LABEL_WIDTH = isMobile ? 104 : 120;
    const HEADER_H1 = 26;
    const HEADER_H2 = isMobile ? 52 : 48;
    const CUT_PX = DAY_COL_WIDTH;

    const {data: properties} = useQuery(propertiesQuery);
    const {data: units} = useQuery(allUnitsQuery);
    const {data: reservations} = useQuery(allReservationsQuery);

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

    function updateMonthLabel(scrollXPx: number) {
        const leftDayIndex = Math.round(scrollXPx / DAY_COL_WIDTH);
        const label = format(addDays(today, leftDayIndex), "MMMM yyyy");
        if (label !== currentMonthKeyRef.current) {
            currentMonthKeyRef.current = label;
            if (monthLabelRef.current) monthLabelRef.current.textContent = label;
        }
    }

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
        suppressClickRef.current = false;
        // Cursor via the DOM, not state — a state change here re-rendered the
        // whole calendar at the start of every drag.
        viewportRef.current?.classList.add("is-dragging");
        dragRef.current = {startX: e.clientX, startScroll: scrollXRef.current, pointerId: e.pointerId, moved: false};
        lastMoveRef.current = {t: performance.now(), x: scrollXRef.current};
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: ReactPointerEvent) {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = e.clientX - drag.startX;
        if (Math.abs(delta) > DRAG_THRESHOLD_PX) drag.moved = true;
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
        const drag = dragRef.current;
        if (drag) {
            (e.target as HTMLElement).releasePointerCapture(drag.pointerId);
        }
        dragRef.current = null;
        viewportRef.current?.classList.remove("is-dragging");

        if (drag?.moved) {
            // A drag that started on a reservation bar would otherwise end in a
            // click on that link and open it.
            suppressClickRef.current = true;
        } else if (drag && e.type === "pointerup" && !(e.target as Element).closest(".cal-bar")) {
            openNewReservationAt(e.clientX, e.clientY);
        }

        const MIN_VELOCITY = 0.03;
        if (Math.abs(velocityRef.current) > MIN_VELOCITY) {
            startMomentum();
        }
    }

    // A drag ends in a click on whatever it started on (a reservation bar, the
    // property header toggle, the "+" button) — swallow that one click.
    function suppressClickAfterDrag(e: ReactMouseEvent) {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
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
        setOpenMenu(null);
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
    const groups = useMemo<PropertyGroup[]>(() => {
        if (!properties || !units) return [];
        const unitsByProperty = new Map<string, UnitResponse[]>();
        for (const u of units) {
            const list = unitsByProperty.get(u.propertyId) ?? [];
            list.push(u);
            unitsByProperty.set(u.propertyId, list);
        }
        return [...properties]
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
            .map((property) => ({
                property,
                units: [...(unitsByProperty.get(property.id) ?? [])].sort(compareUnits),
            }));
    }, [properties, units]);

    // Collapsing only makes sense with more than one property.
    const canCollapse = groups.length > 1;
    const layout = useMemo<LayoutRow[]>(() => {
        const rows: LayoutRow[] = [];
        let top = 0;
        for (const group of groups) {
            const isCollapsed = canCollapse && collapsed.has(group.property.id);
            // Property headers only when there's more than one property to tell
            // apart — with a single property the rooms start right under the dates.
            if (canCollapse) {
                rows.push({
                    kind: "group",
                    group,
                    collapsed: isCollapsed,
                    gridRow: rows.length + 3,
                    top,
                    height: GROUP_HEIGHT
                });
                top += GROUP_HEIGHT;
            }
            if (isCollapsed) continue;
            for (const unit of group.units) {
                rows.push({kind: "unit", unit, gridRow: rows.length + 3, top, height: ROW_HEIGHT});
                top += ROW_HEIGHT;
            }
        }
        return rows;
    }, [groups, canCollapse, collapsed, GROUP_HEIGHT, ROW_HEIGHT]);

    const unitRows = useMemo(
        () => layout.filter((r): r is Extract<LayoutRow, { kind: "unit" }> => r.kind === "unit"),
        [layout]
    );

    const bars = useMemo(() => {
        if (!reservations || !units) return [];
        const rowIndexByUnit = new Map(unitRows.map((r) => [r.unit.id, r.gridRow]));

        return reservations
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

                const colors = STATUS_COLORS[r.status] ?? SOURCE_COLORS[r.source] ?? SOURCE_COLORS.DIRECT;
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
    }, [reservations, units, unitRows, today, windowState, CUT_PX, DAY_COL_WIDTH, BAR_HEIGHT, BAR_MARGIN]);

    const bodyEndRow = layout.length + 3;
    const headerHeight = HEADER_H1 + HEADER_H2;

    // One handler for the whole grid instead of a <Link> per room per day
    // (hundreds of them, all re-rendered whenever the day window shifted —
    // that's what made scrolling stutter). Maps the tap position to a room + day.
    function openNewReservationAt(clientX: number, clientY: number) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const rect = viewport.getBoundingClientRect();
        const y = clientY - rect.top - headerHeight;
        if (y < 0) return;
        const row = unitRows.find((r) => y >= r.top && y < r.top + r.height);
        if (!row) return;
        const dayIndex = Math.floor((clientX - rect.left + scrollXRef.current) / DAY_COL_WIDTH);
        const checkIn = format(addDays(today, dayIndex), "yyyy-MM-dd");
        navigate(`/dashboard/reservations/new?unitId=${row.unit.id}&checkIn=${checkIn}`);
    }

    const todayColIndex = renderedDays.findIndex((d) => d.isToday);
    const isLoading = !properties || !units;

    // The numbers that actually vary at runtime — CSS reads them via
    // var(...) so the rest of the styling can live as static rules in
    // CalendarPage.css instead of inline objects.
    const rootVars = {
        ["--day-col-width" as string]: `${DAY_COL_WIDTH}px`,
        ["--row-height" as string]: `${ROW_HEIGHT}px`,
        ["--bar-height" as string]: `${BAR_HEIGHT}px`,
        ["--label-width" as string]: `${LABEL_WIDTH}px`,
        ["--header-h1" as string]: `${HEADER_H1}px`,
        ["--header-h2" as string]: `${HEADER_H2}px`,
        ["--group-height" as string]: `${GROUP_HEIGHT}px`,
    };

    return (
        <div className="cal-root" style={rootVars}>
            <div className="cal-toolbar">
                <h1 className="cal-title">Calendar</h1>
                <button type="button" className="cal-today-btn" onClick={() => handleJumpToDate(today)}>
                    Today
                </button>

                <div className="cal-actions">
                    <div ref={datePickerRef} className="cal-popover-anchor">
                        <button
                            type="button"
                            onClick={() => toggleMenu("date")}
                            title="Jump to date"
                            aria-label="Jump to date"
                            aria-expanded={openMenu === "date"}
                            className={`cal-icon-btn${openMenu === "date" ? " is-active" : ""}`}
                        >
                            <CalendarIcon size={20}/>
                        </button>
                        {openMenu === "date" && (
                            <div className="cal-popover cal-popover--date rdp-theme">
                                <DayPicker
                                    mode="single"
                                    selected={undefined}
                                    onSelect={handleJumpToDate}
                                    defaultMonth={today}
                                    disabled={{
                                        before: addDays(today, -MAX_RANGE_DAYS),
                                        after: addDays(today, MAX_RANGE_DAYS)
                                    }}
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleRefresh}
                        title="Refresh"
                        aria-label="Refresh"
                        className="cal-icon-btn"
                    >
                        <RefreshIcon size={20} className={isFetching ? "cal-spin" : undefined}/>
                    </button>

                    <div ref={moreMenuRef} className="cal-popover-anchor">
                        <button
                            type="button"
                            onClick={() => toggleMenu("more")}
                            title="More"
                            aria-label="More actions"
                            aria-expanded={openMenu === "more"}
                            className={`cal-icon-btn${openMenu === "more" ? " is-active" : ""}`}
                        >
                            <MoreVerticalIcon size={20}/>
                        </button>
                        {openMenu === "more" && (
                            <div className="cal-popover cal-menu" role="menu">
                                <Link to="/dashboard/reservations/new" className="cal-menu-item" role="menuitem">
                                    New reservation
                                </Link>
                                <Link to={addUnitPath(activeProperty)} state={fromHere} className="cal-menu-item"
                                      role="menuitem">
                                    Add unit
                                </Link>
                                <Link to="/dashboard/properties/new" className="cal-menu-item" role="menuitem">
                                    Add property
                                </Link>
                                {canCollapse && (
                                    <>
                                        <div className="cal-menu-divider"/>
                                        <button
                                            type="button"
                                            className="cal-menu-item"
                                            role="menuitem"
                                            onClick={() => {
                                                saveCollapsed(new Set());
                                                setOpenMenu(null);
                                            }}
                                        >
                                            Expand all properties
                                        </button>
                                        <button
                                            type="button"
                                            className="cal-menu-item"
                                            role="menuitem"
                                            onClick={() => {
                                                saveCollapsed(new Set(groups.map((g) => g.property.id)));
                                                setOpenMenu(null);
                                            }}
                                        >
                                            Collapse all properties
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="cal-loading">Loading calendar...</div>
            ) : units && units.length === 0 ? (
                <div className="cal-empty">
                    {properties.length === 0 ? (
                        <>
                            <p className="cal-empty-text">Add your first property to start filling your calendar.</p>
                            <Link to="/dashboard/properties/new" className="cal-empty-link">Add a property</Link>
                        </>
                    ) : (
                        <>
                            <p className="cal-empty-text">No rooms yet — add one to see it on the calendar.</p>
                            <Link to={addUnitPath(activeProperty)} state={fromHere} className="cal-empty-link">Add a
                                unit</Link>
                        </>
                    )}
                </div>
            ) : (
                <div className="cal-shell">
                    <div className="cal-label-col">
                        <div className="cal-label-header">
                            <div className="cal-label-title">
                                Rooms ({units?.length ?? 0})
                            </div>
                        </div>
                        {layout.map((row) =>
                            row.kind === "group" ? (
                                // Placeholder — the visible header is the full-width overlay below.
                                <div key={"g-" + row.group.property.id} className="cal-group-spacer"/>
                            ) : (
                                <Link
                                    key={row.unit.id}
                                    to={`/dashboard/properties/${row.unit.propertyId}/units/${row.unit.id}`}
                                    state={fromHere}
                                    className="cal-unit-row"
                                >
                                    <div className="cal-unit-name">
                                        {row.unit.name}
                                    </div>
                                    <div className="cal-unit-capacity">
                                        <BedIcon/>
                                        <PersonIcon/>
                                        {row.unit.capacity}
                                    </div>
                                </Link>
                            )
                        )}
                    </div>

                    {/* Property headers span the label column and the grid, so long
                        names aren't squeezed into the narrow label column. */}
                    {layout.map((row) => {
                        if (row.kind !== "group") return null;
                        const {property, units: groupUnits} = row.group;
                        console.log(layout)
                        const count = `${groupUnits.length} ${groupUnits.length === 1 ? "room" : "rooms"}`;
                        return (
                            <div
                                key={"gh-" + property.id}
                                className={`cal-group-header${canCollapse ? "" : " is-static"}`}
                                style={{top: headerHeight + row.top, height: row.height}}
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={onPointerUp}
                                onClickCapture={suppressClickAfterDrag}
                            >

                                {/* Toggle covers the whole header; the content sits above it
                                    with pointer-events off, except the add-unit button — so the
                                    two controls stay siblings instead of nesting a link in a button. */}
                                {canCollapse && (
                                    <button
                                        type="button"
                                        className="cal-group-toggle"
                                        aria-expanded={!row.collapsed}
                                        aria-label={`${row.collapsed ? "Expand" : "Collapse"} ${property.name}`}
                                        onClick={() => toggleGroup(property.id)}
                                    />
                                )}
                                {/*{canCollapse && (*/}
                                {/*    <ChevronDownIcon className={`cal-group-chevron${row.collapsed ? " is-collapsed" : ""}`}/>*/}
                                {/*)}*/}
                                <Link
                                    to={`/dashboard/properties/${property.id}/units/new`}
                                    state={fromHere}
                                    className="cal-group-add"
                                    title={`Add unit to ${property.name}`}
                                    aria-label={`Add unit to ${property.name}`}
                                >
                                    <PlusIcon size={15}/>
                                </Link>
                                <span className="cal-group-text">
                                    <span className="cal-group-name">{property.name}</span>
                                    <span className="cal-group-meta">
                                        {count}{property.address ? ` · ${property.address}` : ""}
                                    </span>
                                </span>

                            </div>
                        );
                    })}

                    <div
                        ref={setViewportRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onClickCapture={suppressClickAfterDrag}
                        className="cal-viewport"
                    >
                        {/* Sticky month label — sits outside the scrolling grid so it
                            stays fixed on the current month instead of scrolling with
                            the days; its text is written directly via monthLabelRef. */}
                        <div ref={monthLabelRef} className="cal-month-label">
                            {format(today, "MMMM yyyy")}
                        </div>

                        <div
                            ref={innerRef}
                            className="cal-grid"
                            style={{
                                width: windowColCount * DAY_COL_WIDTH,
                                display: "grid",
                                gridTemplateColumns: `repeat(${windowColCount}, ${DAY_COL_WIDTH}px)`,
                                gridTemplateRows: [HEADER_H1, HEADER_H2, ...layout.map((r) => r.height)]
                                    .map((h) => `${h}px`).join(" "),
                            }}
                        >
                            <div
                                className="cal-grid-header-bg"
                                style={{gridColumn: `1 / ${windowColCount + 1}`, gridRow: "1 / 3"}}
                            />

                            {renderedDays.map((d, i) => (
                                <div
                                    key={"bg-" + d.index}
                                    className={`cal-day-bg${d.isToday ? " is-today" : d.isWeekend ? " is-weekend" : ""}`}
                                    style={{
                                        gridColumn: `${i + 1} / ${i + 2}`,
                                        gridRow: `3 / ${bodyEndRow}`,
                                    }}
                                />
                            ))}

                            {/* Row separators, and an opaque band behind each property header. */}
                            {layout.map((row) => (

                                    <div
                                        key={row.kind === "group" ? "band-" + row.group.property.id : "line-" + row.unit.id}
                                        className={row.kind === "group" ? "cal-group-band" : "cal-row-line"}
                                        style={{
                                            gridColumn: `1 / ${windowColCount + 1}`,
                                            gridRow: `${row.gridRow} / ${row.gridRow + 1}`
                                        }}
                                    />
                                )
                            )}

                            {todayColIndex >= 0 && (
                                <div
                                    className="cal-today-marker"
                                    style={{
                                        gridColumn: `${todayColIndex + 1} / ${todayColIndex + 2}`,
                                        gridRow: "1 / 3"
                                    }}
                                />
                            )}

                            {renderedDays.map((d, i) => (
                                <div
                                    key={"h-" + d.index}
                                    className={`cal-day-header${d.isWeekend && !d.isToday ? " is-weekend" : ""}`}
                                    style={{gridColumn: `${i + 1} / ${i + 2}`, gridRow: "2 / 3"}}
                                >
                                    <div
                                        className={`cal-day-num${d.isToday ? " is-today" : d.isWeekend ? " is-weekend" : ""}`}>
                                        {d.dayNum}
                                    </div>
                                    <div
                                        className={`cal-day-weekday${d.isToday ? " is-today" : d.isWeekend ? " is-weekend" : ""}`}>
                                        {d.weekdayLabel}
                                    </div>
                                </div>
                            ))}

                            {bars.map((b) => (
                                <Link
                                    key={b.id}
                                    to={`/dashboard/reservations/${b.id}`}
                                    className="cal-bar"
                                    style={{
                                        gridColumn: b.gridColumn,
                                        gridRow: b.gridRow,
                                        alignSelf: "center",
                                        width: b.W,
                                        height: b.H,
                                    }}
                                >
                                    <svg width={b.W} height={b.H} className="cal-bar-svg">
                                        <polygon
                                            points={b.points}
                                            fill={b.fill}
                                            stroke={b.borderColor}
                                            strokeWidth={1.5}
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                    <span className="cal-bar-label-wrap">
                                        {/* Nested block element — text-overflow:ellipsis doesn't
                                            reliably truncate a direct text child of a flex
                                            container, so the truncating span needs its own
                                            block formatting context. */}
                                        <span className="cal-bar-label" style={{color: b.textColor}}>
                                            {b.guestName}
                                        </span>
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="cal-footer">
                <span className="cal-footer-hint">← Drag to browse dates →</span>
            </div>
        </div>
    );
}