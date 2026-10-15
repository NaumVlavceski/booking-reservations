import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import type {
    MouseEvent as ReactMouseEvent,
    PointerEvent as ReactPointerEvent,
    TouchEvent as ReactTouchEvent,
    UIEvent as ReactUIEvent,
} from "react";
import {Link, useNavigate} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {format, addDays, differenceInCalendarDays} from "date-fns";
import {DayPicker} from "react-day-picker";
import "react-day-picker/style.css";
import {propertiesQuery, type PropertyResponse} from "../lib/api/properties";
import {allUnitsQuery, type UnitResponse} from "../lib/api/units";
import {allReservationsQuery} from "../lib/api/reservations";
import {addUnitPath, useActiveProperty} from "../lib/useActiveProperty";
import {useFromHere} from "../lib/useReturnTo";
import {BedIcon, CalendarIcon, MoreVerticalIcon, PersonIcon, PlusIcon} from "../components/icons";
import "./CalendarPage.css";
import SyncAllButton from "../components/SyncAllButton.tsx";
import {amountDue, layoutBarLabel} from "../lib/barLabel";
import {formatStay} from "../lib/dates";
import {easeOutQuad, flingTail} from "../lib/fling";

const MAX_RANGE_DAYS = 5 * 365;
const CHUNK = 20;
const BUFFER_CHUNKS = 1;

// Confirmed reservations are colored by where they came from.
const SOURCE_COLORS: Record<string, { fill: string; border: string; text: string; label: string }> = {
    DIRECT: {fill: "#FDECC8", border: "#D97706", text: "#78350F", label: "Direct"},
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
const DRAG_THRESHOLD_PX = 5;
const TAP_SLOP_PX = 8;
const FLING_HANDOVER_DAYS = 3;
const FLING_TAIL_MS = 200;
const FLING_MAX_TAIL_DAYS = 7;
const FLING_MIN_SPEED = 0.4;
const FLING_WATCH_MS = 3000;
const COLLAPSED_KEY = "roomtrack.calendar.collapsedProperties";

/**
 * iOS before 16 ignores `overscroll-behavior`, so the grid would still bounce the page (and start
 * pull-to-refresh) when dragged past its top or bottom. For those browsers only, swallow a mostly
 * vertical touch that would scroll past an edge. Everything else keeps native scrolling.
 */
function guardEdgeBounce(el: HTMLElement): () => void {
    if (typeof CSS !== "undefined" && CSS.supports?.("overscroll-behavior", "none")) return () => {};

    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
        if (e.touches.length !== 1 || !e.cancelable) return; // multi-touch (pinch) is left alone
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (Math.abs(dy) <= Math.abs(dx)) return;
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
    };
    el.addEventListener("touchstart", onStart, {passive: true});
    el.addEventListener("touchmove", onMove, {passive: false});
    return () => {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchmove", onMove);
    };
}

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

let labelCanvas: CanvasRenderingContext2D | null | undefined;

/** Width of a bar label in the bar's own font (600 weight). */
function measureLabel(text: string, size: number): number {
    if (labelCanvas === undefined) labelCanvas = document.createElement("canvas").getContext("2d");
    // No canvas (very old browser / tests): rough per-character estimate. CSS
    // ellipsis still guarantees nothing spills out of the bar.
    if (!labelCanvas) return text.length * size * 0.6;
    labelCanvas.font = `600 ${size}px ${getComputedStyle(document.body).fontFamily}`;
    return labelCanvas.measureText(text).width;
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
    // The one element that scrolls, natively, in both directions (room column and date header are CSS-sticky inside it).
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const edgeGuardCleanupRef = useRef<(() => void) | null>(null);
    const monthLabelRef = useRef<HTMLDivElement>(null); // sticky "current month" label — text written directly, not via React state
    const currentMonthKeyRef = useRef<string>("");
    const today = useMemo(() => startOfToday(), []);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
    // Width of the scroller (room column included); the day columns get what is left after the room column.
    const [scrollerWidth, setScrollerWidth] = useState(() =>
        Math.max(364, window.innerWidth - (window.innerWidth < 640 ? 0 : 48))
    );

    const [windowState, setWindowState] = useState({start: 0, end: 0});
    const windowRef = useRef(windowState);
    useLayoutEffect(() => {
        windowRef.current = windowState;
    }, [windowState]);

    const scrollXRef = useRef(0);

    // Only a mouse pans by dragging (`pan`); touch and pen scroll natively, so here they just need tap detection.
    const dragRef = useRef<{
        startX: number;
        startY: number;
        startScroll: number;
        pointerId: number;
        moved: boolean;
        pan: boolean;
    } | null>(null);
    const suppressClickRef = useRef(false);
    const navigate = useNavigate();
    const velocityRef = useRef(0);
    const lastMoveRef = useRef<{ t: number; x: number } | null>(null);
    const momentumFrameRef = useRef<number | null>(null);
    const scrollFrameRef = useRef<number | null>(null);
    const pendingLeftRef = useRef(0);
    // Touch flings (see FLING_* above)
    const touchingRef = useRef(false);
    const sampleRef = useRef<{ t: number; left: number; top: number; vx: number; vy: number } | null>(null);
    const flingRef = useRef<{ releasedAt: number; releaseLeft: number } | null>(null);
    const tailFrameRef = useRef<number | null>(null);

    const [openMenu, setOpenMenu] = useState<"date" | "more" | null>(null);
    const datePickerRef = useRef<HTMLDivElement | null>(null);
    const moreMenuRef = useRef<HTMLDivElement | null>(null);

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

    const setScrollerRef = useCallback((node: HTMLDivElement | null) => {
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
        edgeGuardCleanupRef.current?.();
        edgeGuardCleanupRef.current = null;
        scrollerRef.current = node;
        if (node) {
            setScrollerWidth(node.clientWidth);
            const observer = new ResizeObserver((entries) => {
                setScrollerWidth(entries[0].contentRect.width);
            });
            observer.observe(node);
            resizeObserverRef.current = observer;
            edgeGuardCleanupRef.current = guardEdgeBounce(node);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (momentumFrameRef.current) cancelAnimationFrame(momentumFrameRef.current);
            if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
            if (tailFrameRef.current) cancelAnimationFrame(tailFrameRef.current);
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

    const LABEL_WIDTH = isMobile ? 104 : 120;
    const viewportWidth = Math.max(0, scrollerWidth - LABEL_WIDTH);
    // Phones: exactly a week fills the width. Desktop: 20 days.
    const DAY_COL_WIDTH = isMobile
        ? Math.max(45, viewportWidth / MOBILE_VISIBLE_DAYS)
        : Math.max(60, Math.floor(viewportWidth / 20));
    const ROW_HEIGHT = isMobile ? 50 : 64;
    const GROUP_HEIGHT = isMobile ? 48 : 52;
    const BAR_HEIGHT = isMobile ? 44 : 60;
    const BAR_MARGIN = isMobile ? 3 : 5;
    const HEADER_H1 = 26;
    const HEADER_H2 = isMobile ? 52 : 48;
    const CUT_PX = DAY_COL_WIDTH;
    // Bar text: keep in sync with .cal-bar-line in CalendarPage.css.
    // Name font sizes, largest first; the smaller one is only used when a name's
    // first word wouldn't otherwise fit (one-night stays).
    const LABEL_FONT_SIZES = useMemo(() => (isMobile ? [12, 11] : [13, 12]), [isMobile]);
    const LABEL_LINE_HEIGHT = isMobile ? 13 : 16;
    const LABEL_PADDING = isMobile ? 1 : 3;

    const {data: properties} = useQuery(propertiesQuery);
    const {data: units} = useQuery(allUnitsQuery);
    const {data: reservations} = useQuery(allReservationsQuery);
    const isLoading = !properties || !units;

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

    // The scroller's scrollLeft is the logical position plus maxScroll, so "today" sits at scrollLeft = maxScroll
    // and the whole ±5 years fit in one native scroll range. Called once per frame after the browser has scrolled.
    function syncFromScroll(scrollXPx: number) {
        const clamped = clampScroll(scrollXPx);
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
    }

    // Moves the grid from code (Today, Jump to date, mouse drag, momentum): write scrollLeft and let the
    // browser report back through onScroll.
    function scrollToX(rawScrollX: number) {
        const clamped = clampScroll(rawScrollX);
        scrollXRef.current = clamped;
        flingRef.current = null;
        if (scrollerRef.current) scrollerRef.current.scrollLeft = clamped + maxScroll;
    }

    useLayoutEffect(() => {
        if (!scrollerWidth) return;
        const next = computeWindow(scrollXRef.current);
        windowRef.current = next;
        setWindowState(next);
        // Right after the grid mounts or the column width changes: put the scroller back where we were
        // (initially: today at the left edge).
        if (scrollerRef.current) scrollerRef.current.scrollLeft = scrollXRef.current + maxScroll;
        updateMonthLabel(scrollXRef.current);
        // Re-run once the grid itself mounts, too: while properties/units are still loading there is no
        // scroller yet, so without `isLoading` here this wouldn't fire again when it appears.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewportWidth, DAY_COL_WIDTH, isLoading]);

    function handleScroll(e: ReactUIEvent<HTMLDivElement>) {
        const left = e.currentTarget.scrollLeft;
        pendingLeftRef.current = left;
        trackFling(e.currentTarget, left, e.currentTarget.scrollTop, e.timeStamp);
        if (scrollFrameRef.current !== null) return;
        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            // While a mouse drag or momentum is moving the grid, our own position is the fresher one
            const driving = momentumFrameRef.current !== null || dragRef.current?.pan;
            syncFromScroll(driving ? scrollXRef.current : pendingLeftRef.current - maxScroll);
        });
    }

    function cancelMomentum() {
        if (momentumFrameRef.current) {
            cancelAnimationFrame(momentumFrameRef.current);
            momentumFrameRef.current = null;
        }
        cancelFlingTail();
        velocityRef.current = 0;
    }

    function cancelFlingTail() {
        if (tailFrameRef.current !== null) {
            cancelAnimationFrame(tailFrameRef.current);
            tailFrameRef.current = null;
        }
    }

    function onTouchStart() {
        cancelFlingTail();
        flingRef.current = null;
        touchingRef.current = true;
    }

    function onTouchEnd(e: ReactTouchEvent<HTMLDivElement>) {
        if (e.touches.length > 0) return; // another finger is still down
        touchingRef.current = false;
        // From here the phone glides on its own; trackFling keeps an eye on how far
        flingRef.current = {releasedAt: e.timeStamp, releaseLeft: pendingLeftRef.current};
    }

    // Called for every scroll event: keeps a running speed, and when a sideways flick has glided far enough
    // after release, hands over to a shorter tail.
    function trackFling(el: HTMLDivElement, left: number, top: number, t: number) {
        const prev = sampleRef.current;
        let vx = 0;
        let vy = 0;
        if (prev && t > prev.t && t - prev.t < 100) {
            const dt = t - prev.t;
            vx = prev.vx * 0.5 + ((left - prev.left) / dt) * 0.5;
            vy = prev.vy * 0.5 + ((top - prev.top) / dt) * 0.5;
        }
        sampleRef.current = {t, left, top, vx, vy};

        const fling = flingRef.current;
        if (!fling || touchingRef.current || tailFrameRef.current !== null) return;
        if (t - fling.releasedAt > FLING_WATCH_MS) {
            flingRef.current = null;
            return;
        }
        if (Math.abs(vx) < FLING_MIN_SPEED || Math.abs(vx) < Math.abs(vy)) return;
        if (Math.abs(left - fling.releaseLeft) < FLING_HANDOVER_DAYS * DAY_COL_WIDTH) return;

        flingRef.current = null;
        startFlingTail(el, left, top, vx, vy);
    }

    function startFlingTail(el: HTMLDivElement, startLeft: number, startTop: number, vx: number, vy: number) {
        const maxTail = FLING_MAX_TAIL_DAYS * DAY_COL_WIDTH;
        const tailX = flingTail(vx, FLING_TAIL_MS, maxTail);
        const duration = tailX.durationMs;
        if (duration <= 0) return;
        // Same duration on both axes keeps the direction of the flick; vertical starts at its own speed.
        const tailY = Math.max(-maxTail, Math.min(maxTail, (vy * duration) / 2));

        // Writing the current position makes the browser drop its own glide (where it allows that)
        el.scrollLeft = startLeft;
        let lastLeft = startLeft;
        let lastTop = startTop;
        const t0 = performance.now();

        function step(now: number) {
            // If the position moved on its own, the browser is still gliding and did not let go: do not fight it.
            if (Math.abs(el.scrollLeft - lastLeft) > 2 || Math.abs(el.scrollTop - lastTop) > 2) {
                tailFrameRef.current = null;
                return;
            }
            const eased = easeOutQuad((now - t0) / duration);
            lastLeft = startLeft + tailX.distance * eased;
            lastTop = startTop + tailY * eased;
            el.scrollLeft = lastLeft;
            el.scrollTop = lastTop;
            tailFrameRef.current = now - t0 < duration ? requestAnimationFrame(step) : null;
        }

        tailFrameRef.current = requestAnimationFrame(step);
    }

    function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
        cancelMomentum();
        suppressClickRef.current = false;
        const target = e.target as HTMLElement;
        const pan = e.pointerType === "mouse" && e.button === 0 && target !== e.currentTarget // not the scrollbar
            && !target.closest(".cal-label-col, .cal-head-corner");
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startScroll: scrollXRef.current,
            pointerId: e.pointerId,
            moved: false,
            pan,
        };
        if (pan) {
            // Cursor via the DOM, not state — a state change here re-rendered the whole calendar at the start of every drag.
            e.currentTarget.classList.add("is-dragging");
            lastMoveRef.current = {t: performance.now(), x: scrollXRef.current};
            target.setPointerCapture(e.pointerId);
        }
    }

    function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = e.clientX - drag.startX;
        if (!drag.pan) {
            if (Math.hypot(delta, e.clientY - drag.startY) > TAP_SLOP_PX) drag.moved = true;
            return;
        }
        if (Math.abs(delta) > DRAG_THRESHOLD_PX) drag.moved = true;
        scrollToX(drag.startScroll - delta);

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

    function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        dragRef.current = null;
        e.currentTarget.classList.remove("is-dragging");
        if (!drag) return;

        if (drag.pan) {
            try {
                (e.target as HTMLElement).releasePointerCapture(drag.pointerId);
            } catch {
                // already released
            }
        }

        if (drag.pan && drag.moved) {
            // A drag that started on a reservation bar would otherwise end in a click on that link and open it.
            suppressClickRef.current = true;
        } else if (!drag.moved && e.type === "pointerup" && !(e.target as Element).closest(".cal-bar")) {
            // For touch, a pan makes the browser cancel the pointer, so reaching pointerup means it was a tap.
            openNewReservationAt(e.clientX, e.clientY);
        }

        const MIN_VELOCITY = 0.03;
        if (drag.pan && Math.abs(velocityRef.current) > MIN_VELOCITY) {
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
            scrollToX(clamped);

            momentumFrameRef.current = requestAnimationFrame(step);
        }

        momentumFrameRef.current = requestAnimationFrame(step);
    }

    function handleJumpToDate(date: Date | undefined) {
        if (!date) return;
        cancelMomentum();
        const dayIndex = differenceInCalendarDays(date, today);
        scrollToX(dayIndex * DAY_COL_WIDTH);
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
                    gridRow: rows.length + 1,
                    top,
                    height: GROUP_HEIGHT
                });
                top += GROUP_HEIGHT;
            }
            if (isCollapsed) continue;
            for (const unit of group.units) {
                rows.push({kind: "unit", unit, gridRow: rows.length + 1, top, height: ROW_HEIGHT});
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
                // Can happen for a frame while the visible day window is being recalculated.
                if (W <= 0) return null;
                const H = BAR_HEIGHT;
                // Same diagonal cut as the SVG polygon, expressed as [x, y] pairs so it
                // can also drive a CSS clip-path on the bar's hit area (see below) —
                // without that, the empty triangle on the checkout day's cell would
                // still register taps on this bar instead of falling through to the
                // grid's "start a new reservation" handler.
                const pointsArr: [number, number][] = trueLeft && trueRight
                    ? [[CUT_PX, 0], [W, 0], [W - CUT_PX, H], [0, H]]
                    : trueLeft
                        ? [[CUT_PX, 0], [W, 0], [W, H], [0, H]]
                        : trueRight
                            ? [[0, 0], [W, 0], [W - CUT_PX, H], [0, H]]
                            : [[0, 0], [W, 0], [W, H], [0, H]];
                const points = pointsArr.map(([x, y]) => `${x},${y}`).join(" ");
                const clipPath = `polygon(${pointsArr.map(([x, y]) => `${x}px ${y}px`).join(", ")})`;

                const guestName = r.guestName?.trim() || "Reservation";
                const due = amountDue(r.status, r.totalAmount, r.priceNeedsReview);
                const label = layoutBarLabel({
                    name: guestName,
                    amount: due ? due.text : null,
                    width: W,
                    height: H,
                    cut: CUT_PX,
                    cutLeft: trueLeft,
                    cutRight: trueRight,
                    lineHeight: LABEL_LINE_HEIGHT,
                    fontSizes: LABEL_FONT_SIZES,
                    amountFontSize: isMobile ? 10.5 : 11.5,
                    glyphRatio: 0.45,
                    padding: LABEL_PADDING,
                    measure: measureLabel,
                });
                const summary = [
                    guestName,
                    formatStay(r.checkIn, r.checkOut),
                    due ? (due.missing ? "No amount recorded" : due.review ? `Due ${due.text.slice(2)} · dates changed, check the price` : `Due ${due.text}`) : r.status === "PAID" ? "Paid" : null,
                ].filter(Boolean).join(" · ");

                return {
                    id: r.id,
                    gridColumn: `${colStart} / ${colEnd}`,
                    gridRow: `${gridRow} / ${gridRow + 1}`,
                    fill: colors.fill,
                    borderColor: colors.border,
                    textColor: colors.text,
                    points,
                    clipPath,
                    W,
                    H,
                    lines: label.lines,
                    nameFontSize: label.fontSize,
                    labelAlign: label.align,
                    amountMissing: due ? due.missing || Boolean(due.review) : false,
                    summary,
                };
            })
            .filter((b): b is NonNullable<typeof b> => b !== null);
    }, [reservations, units, unitRows, today, windowState, CUT_PX, DAY_COL_WIDTH, BAR_HEIGHT, BAR_MARGIN,
        LABEL_FONT_SIZES, LABEL_LINE_HEIGHT, LABEL_PADDING, isMobile]);

    const bodyEndRow = layout.length + 1;
    const headerHeight = HEADER_H1 + HEADER_H2;
    const bodyHeight = layout.reduce((h, r) => h + r.height, 0);
    // Room for the whole ±5 years, so the browser's own scroll range covers it
    const spacerWidth = 2 * maxScroll + viewportWidth;
    // The 60-column window of days that is actually rendered sits at its true position inside that range
    const gridLeft = (windowState.start + MAX_RANGE_DAYS) * DAY_COL_WIDTH;

    // One handler for the whole grid instead of a <Link> per room per day
    // (hundreds of them, all re-rendered whenever the day window shifted —
    // that's what made scrolling stutter). Maps the tap position to a room + day.
    function openNewReservationAt(clientX: number, clientY: number) {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        const rect = scroller.getBoundingClientRect();
        const x = clientX - rect.left - LABEL_WIDTH; // inside the day columns (not the room column)
        if (x < 0) return;
        const y = clientY - rect.top + scroller.scrollTop - headerHeight; // inside the rows (not the date header)
        if (y < 0) return;
        const row = unitRows.find((r) => y >= r.top && y < r.top + r.height);
        if (!row) return;
        const dayIndex = Math.floor((x + scrollXRef.current) / DAY_COL_WIDTH);
        const checkIn = format(addDays(today, dayIndex), "yyyy-MM-dd");
        navigate(`/dashboard/reservations/new?unitId=${row.unit.id}&checkIn=${checkIn}`);
    }

    const todayColIndex = renderedDays.findIndex((d) => d.isToday);

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

                    <SyncAllButton/>
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
                                <Link to={addUnitPath(activeProperty)} state={fromHere} className="cal-menu-item"
                                      role="menuitem">
                                    Add room
                                </Link>
                                <Link to="/dashboard/properties/new" className="cal-menu-item" role="menuitem">
                                    Add property
                                </Link>
                                <div className="cal-menu-divider"/>
                                <Link to="/dashboard/cancelled" className="cal-menu-item" role="menuitem">
                                    Cancelled bookings
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
                                room</Link>
                        </>
                    )}
                </div>
            ) : (
                <div className="cal-shell">
                    <div
                        ref={setScrollerRef}
                        className="cal-scroller"
                        tabIndex={0}
                        role="region"
                        aria-label="Booking calendar"
                        onScroll={handleScroll}
                        onWheel={cancelMomentum}
                        onTouchStart={onTouchStart}
                        onTouchEnd={onTouchEnd}
                        onTouchCancel={onTouchEnd}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onClickCapture={suppressClickAfterDrag}
                    >
                        <div className="cal-content" style={{width: LABEL_WIDTH + spacerWidth}}>
                            {/* Date header: sticky to the top of the scroller. The corner stays put on the left;
                                the days slide underneath it. */}
                            <div className="cal-head" style={{height: headerHeight}}>
                                <div className="cal-head-corner">
                                    <div className="cal-label-title">
                                        Rooms ({units?.length ?? 0})
                                    </div>
                                </div>
                                <div className="cal-head-days" style={{width: spacerWidth}}>
                                    {/* Sticky month label: stays on the current month instead of scrolling with the
                                        days; its text is written directly via monthLabelRef. */}
                                    <div ref={monthLabelRef} className="cal-month-label">
                                        {format(today, "MMMM yyyy")}
                                    </div>
                                    <div
                                        className="cal-head-grid"
                                        style={{
                                            left: gridLeft,
                                            width: windowColCount * DAY_COL_WIDTH,
                                            gridTemplateColumns: `repeat(${windowColCount}, ${DAY_COL_WIDTH}px)`,
                                            gridTemplateRows: `${HEADER_H1}px ${HEADER_H2}px`,
                                        }}
                                    >
                                        <div
                                            className="cal-grid-header-bg"
                                            style={{gridColumn: `1 / ${windowColCount + 1}`, gridRow: "1 / 3"}}
                                        />

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

                                    </div>
                                </div>
                            </div>

                            <div className="cal-body" style={{height: bodyHeight}}>
                                {/* Room column: sticky to the left of the scroller. */}
                                <div className="cal-label-col">
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
                                        <div className="cal-unit-name" title={row.unit.name}>
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

                                <div className="cal-days" style={{width: spacerWidth}}>
                                    <div
                                        className="cal-grid"
                                        style={{
                                            left: gridLeft,
                                            width: windowColCount * DAY_COL_WIDTH,
                                            display: "grid",
                                            gridTemplateColumns: `repeat(${windowColCount}, ${DAY_COL_WIDTH}px)`,
                                            gridTemplateRows: layout.map((r) => `${r.height}px`).join(" "),
                                        }}
                                    >
                                    {renderedDays.map((d, i) => (
                                        <div
                                            key={"bg-" + d.index}
                                            className={`cal-day-bg${d.isToday ? " is-today" : d.isWeekend ? " is-weekend" : ""}`}
                                            style={{
                                                gridColumn: `${i + 1} / ${i + 2}`,
                                                gridRow: `1 / ${bodyEndRow}`,
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

                                    {bars.map((b) => (
                                        <Link
                                            key={b.id}
                                            to={`/dashboard/reservations/${b.id}`}
                                            title={b.summary}
                                            aria-label={b.summary}
                                            className="cal-bar"
                                            style={{
                                                gridColumn: b.gridColumn,
                                                gridRow: b.gridRow,
                                                alignSelf: "center",
                                                width: b.W,
                                                height: b.H,
                                                clipPath: b.clipPath,
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
                                            {/* Each line is placed along the bar's slanted edges
                                                (see lib/barLabel.ts); CSS ellipsises what's left. */}
                                            {b.lines.map((line, i) => (
                                                <span
                                                    key={i}
                                                    aria-hidden="true"
                                                    className={`cal-bar-line cal-bar-line--${line.kind}`}
                                                    style={{
                                                        left: line.left,
                                                        top: line.top,
                                                        width: line.width,
                                                        height: LABEL_LINE_HEIGHT,
                                                        lineHeight: `${LABEL_LINE_HEIGHT}px`,
                                                        fontSize: line.kind === "name" ? b.nameFontSize : undefined,
                                                        textAlign: b.labelAlign,
                                                        color: b.textColor,
                                                    }}
                                                >
                                                    {line.kind === "amount" && b.amountMissing
                                                        ? <span className="cal-bar-amount-missing">{line.text}</span>
                                                        : line.text}
                                                </span>
                                            ))}
                                        </Link>
                                    ))}
                                    </div>
                                </div>
                            </div>

                            {/* Property headers span the room column and the grid, so long names aren't squeezed
                                into the narrow room column. Each one sticks to the left edge of the scroller. */}
                            {layout.map((row) => {
                                if (row.kind !== "group") return null;
                                const {property, units: groupUnits} = row.group;
                                const count = `${groupUnits.length} ${groupUnits.length === 1 ? "room" : "rooms"}`;
                                return (
                                    <div
                                        key={"gh-" + property.id}
                                        className="cal-group-row"
                                        style={{top: headerHeight + row.top, height: row.height}}
                                    >
                                        <div
                                            className={`cal-group-header${canCollapse ? "" : " is-static"}`}
                                            style={{width: scrollerWidth}}
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
                                        title={`Add a room to ${property.name}`}
                                        aria-label={`Add a room to ${property.name}`}
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
                                    </div>
                                );
                            })}
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