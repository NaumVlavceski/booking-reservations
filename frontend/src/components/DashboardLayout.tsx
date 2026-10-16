// src/components/DashboardLayout.tsx
import {useEffect, useState, type ComponentType, type ReactNode} from "react";
import {Link, Outlet, useLocation, useNavigate} from "react-router-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {getMe} from "../lib/api/me";
import {addUnitPath, useActiveProperty} from "../lib/useActiveProperty";
import {useFromHere} from "../lib/useReturnTo";
import {useAlertStripVisible, useSyncAlerts} from "../lib/useSyncAlerts";
import {bottomChrome} from "../lib/shellRoutes";
import {
    AlertIcon,
    CalendarIcon,
    CalendarXIcon,
    ChevronRightIcon,
    HelpIcon,
    HouseIcon,
    LogoutIcon,
    MoreHorizontalIcon,
    PlusIcon,
    SyncIcon,
} from "./icons";
import SyncAlerts from "./SyncAlerts";
import NotificationToggle from "./NotificationToggle";
import ThemeToggle from "./ThemeToggle";
import {applyAccountTheme} from "../lib/theme";
import AppLogo from "./AppLogo";
import Sheet from "./ui/Sheet";
import {CountBubble} from "./ui/Badge";

type IconType = ComponentType<{ size?: number; className?: string }>;

const HELP_PATH = "/dashboard/help/connect-calendars";

function isChannels(pathname: string) {
    return pathname.startsWith("/dashboard/conflicts") || pathname.startsWith("/dashboard/sync-health");
}

function isCalendarArea(pathname: string) {
    return pathname.startsWith("/dashboard/calendar") || pathname.startsWith("/dashboard/reservations");
}

function initials(name: string | undefined) {
    const words = (name ?? "RoomTrack").trim().split(/\s+/);
    return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

/** "4 warnings" for screen readers; the visible bubble is decorative. */
function warnings(count: number) {
    return count > 0 ? <span className="sr-only">, {count} {count === 1 ? "warning" : "warnings"}</span> : null;
}

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const {pathname} = location;
    const queryClient = useQueryClient();
    const activeProperty = useActiveProperty();
    const {data: me} = useQuery({queryKey: ["me"], queryFn: getMe, staleTime: Infinity});
    // Each account keeps its own light/dark choice (light until it picks dark).
    useEffect(() => {
        if (me?.email) applyAccountTheme(me.email);
    }, [me?.email]);
    const {conflictCount, failingCount, total: alertCount} = useSyncAlerts();
    const stripVisible = useAlertStripVisible();
    const fromHere = useFromHere();
    // The More sheet (phones and tablets) closes by itself when you navigate somewhere.
    const [moreOpenedAt, setMoreOpenedAt] = useState<string | null>(null);
    const isMoreOpen = moreOpenedAt === location.key;
    const closeMore = () => setMoreOpenedAt(null);
    const isCalendar = pathname.startsWith("/dashboard/calendar");
    const chrome = bottomChrome(pathname);
    const businessName = me?.businessName ?? "RoomTrack";

    function handleLogout() {
        tokenStorage.clear();
        queryClient.clear();
        closeMore();
        navigate("/login", {replace: true});
    }

    const moreActive = isMoreOpen || pathname.startsWith("/dashboard/cancelled") || pathname.startsWith("/dashboard/help");
    const destinations: { key: string; to: string; label: string; icon: IconType; active: boolean; count?: number }[] = [
        {key: "calendar", to: "/dashboard/calendar", label: "Calendar", icon: CalendarIcon, active: isCalendarArea(pathname)},
        {key: "channels", to: "/dashboard/conflicts", label: "Channels", icon: SyncIcon, active: isChannels(pathname), count: alertCount},
    ];

    return (
        <div className="min-h-dvh">
            <a href="#main" className="sr-only z-[80] rounded-xl bg-surface-raised px-4 py-3 font-semibold text-fg shadow-popover focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
                Skip to content
            </a>

            {/* Desktop: sidebar with everything in view. */}
            <aside aria-label="Main menu" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-subtle bg-surface lg:flex">
                <div className="flex items-center gap-3 px-5 pt-6 pb-5">
                    <span className="shrink-0 rounded-xl p-1"><AppLogo size={28}/></span>
                    <p className="min-w-0 truncate text-title-3 text-fg">{businessName}</p>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    <nav aria-label="Main" className="space-y-0.5">
                        <SidebarLink to="/dashboard/calendar" icon={CalendarIcon} active={isCalendarArea(pathname)}>Calendar</SidebarLink>
                        <SidebarLink to="/dashboard/properties" icon={HouseIcon} active={pathname.startsWith("/dashboard/properties")}>Properties</SidebarLink>
                        <SidebarLink to="/dashboard/cancelled" icon={CalendarXIcon} active={pathname.startsWith("/dashboard/cancelled")}>Cancelled bookings</SidebarLink>
                    </nav>
                    <SidebarGroup label="Channels">
                        <SidebarLink to="/dashboard/conflicts" icon={AlertIcon} active={pathname === "/dashboard/conflicts"}
                                     trailing={<CountBubble count={conflictCount} className="ml-auto"/>}>
                            Booking conflicts{warnings(conflictCount)}
                        </SidebarLink>
                        <SidebarLink to="/dashboard/sync-health" icon={SyncIcon} active={pathname === "/dashboard/sync-health"}
                                     trailing={<CountBubble count={failingCount} tone="warning" className="ml-auto"/>}>
                            Sync status{warnings(failingCount)}
                        </SidebarLink>
                    </SidebarGroup>
                    <SidebarGroup label="Quick add">
                        <SidebarLink to="/dashboard/properties/new" icon={PlusIcon} active={false}>Add property</SidebarLink>
                        <SidebarLink to={addUnitPath(activeProperty)} state={fromHere} icon={PlusIcon} active={false}>
                            <span className="min-w-0">
                                Add room
                                {activeProperty && <span className="block truncate text-caption font-normal text-subtle">to {activeProperty.name}</span>}
                            </span>
                        </SidebarLink>
                    </SidebarGroup>
                </div>
                <div className="space-y-0.5 border-t border-subtle px-3 pt-3 pb-4">
                    <SidebarLink to={HELP_PATH} state={fromHere} icon={HelpIcon} active={pathname.startsWith("/dashboard/help")}>
                        Channel setup guide
                    </SidebarLink>
                    <ThemeToggle email={me?.email} compact/>
                    <NotificationToggle compact/>
                    <div className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2">
                        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-caption font-bold text-on-primary-soft">
                            {initials(me?.fullName ?? me?.businessName)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-body-sm font-semibold text-fg">{me?.fullName ?? businessName}</p>
                            {me?.email && <p className="truncate text-caption text-subtle">{me.email}</p>}
                        </div>
                        <button type="button" onClick={handleLogout} className="icon-btn text-muted" aria-label="Log out" title="Log out">
                            <LogoutIcon size={20}/>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Tablets: a slim rail with the same four destinations as the phone tab bar. */}
            <nav aria-label="Main" className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center gap-1 border-r border-subtle bg-surface pt-[calc(env(safe-area-inset-top)+1rem)] sm:flex lg:hidden">
                <Link to="/dashboard/calendar" className="mb-4 rounded-xl p-1" aria-label={`${businessName}, calendar`}>
                    <span className="block rounded-xl bg-white p-1 ring-1 ring-black/5"><AppLogo size={30}/></span>
                </Link>
                {destinations.map((d) => (
                    <RailItem key={d.key} to={d.to} label={d.label} icon={d.icon} active={d.active} count={d.count}/>
                ))}
                <RailItem label="More" icon={MoreHorizontalIcon} active={moreActive} expanded={isMoreOpen} onClick={() => setMoreOpenedAt(location.key)}/>
            </nav>

            <main
                id="main"
                tabIndex={-1}
                className={`outline-none ${stripVisible && isCalendar ? "has-alert-strip" : ""} ${
                    isCalendar
                        ? "pb-[calc(4rem+1px+env(safe-area-inset-bottom))] sm:py-6 sm:pr-6 sm:pb-6 sm:pl-[6.5rem] lg:py-8 lg:pr-8 lg:pl-72"
                        : `px-4 sm:px-6 sm:py-6 sm:pl-[6.5rem] lg:px-8 lg:py-8 lg:pl-72 ${
                            chrome === "form" ? "pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-28 lg:pb-28" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
                        }`
                }`}
            >
                {isCalendar ? (
                    <>
                        <SyncAlerts className="px-4 pt-[env(safe-area-inset-top)] box-content sm:px-0 sm:pt-0"/>
                        <Outlet/>
                    </>
                ) : (
                    <div className="mx-auto w-full max-w-5xl">
                        <Outlet/>
                    </div>
                )}
            </main>

            {/* Phones: bottom tab bar (forms replace it with their Save bar). */}
            {chrome === "tabs" && (
                <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-subtle bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
                    {destinations.map((d) => (
                        <TabItem key={d.key} to={d.to} label={d.label} icon={d.icon} active={d.active} count={d.count}/>
                    ))}
                    <TabItem label="More" icon={MoreHorizontalIcon} active={moreActive} expanded={isMoreOpen} onClick={() => setMoreOpenedAt(location.key)}/>
                </nav>
            )}

            <Sheet open={isMoreOpen} onClose={closeMore} title="More" titleHidden showClose closeLabel="Close menu">
                <div className="flex items-center gap-3 pr-10 pb-4">
                    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-body-sm font-bold text-on-primary-soft">
                        {initials(me?.businessName)}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-title-3 text-fg">{businessName}</p>
                        {me?.email && <p className="truncate text-body-sm text-muted">{me.email}</p>}
                    </div>
                </div>
                <div className="space-y-3">
                    <SheetGroup>
                        <SheetLink to="/dashboard/cancelled" icon={CalendarXIcon} onClick={closeMore} chevron>Cancelled bookings</SheetLink>
                        <SheetLink to="/dashboard/conflicts" icon={AlertIcon} onClick={closeMore}
                                   trailing={<CountBubble count={conflictCount}/>}>Booking conflicts{warnings(conflictCount)}</SheetLink>
                        <SheetLink to="/dashboard/sync-health" icon={SyncIcon} onClick={closeMore}
                                   trailing={<CountBubble count={failingCount} tone="warning"/>}>Sync status{warnings(failingCount)}</SheetLink>
                    </SheetGroup>
                    <SheetGroup>
                        <SheetLink to="/dashboard/properties/new" icon={PlusIcon} onClick={closeMore}>Add property</SheetLink>
                        <SheetLink to={addUnitPath(activeProperty)} state={fromHere} icon={PlusIcon} onClick={closeMore}>
                            <span className="min-w-0 truncate">
                                Add room{activeProperty && <span className="font-normal text-subtle"> to {activeProperty.name}</span>}
                            </span>
                        </SheetLink>
                    </SheetGroup>
                    <SheetGroup>
                        <SheetLink to={HELP_PATH} state={fromHere} icon={HelpIcon} onClick={closeMore} chevron>Connect Booking.com &amp; Airbnb</SheetLink>
                        <ThemeToggle email={me?.email}/>
                        <NotificationToggle/>
                    </SheetGroup>
                    <SheetGroup>
                        <button type="button" onClick={handleLogout} className={sheetRow}>
                            <LogoutIcon size={20} className="text-muted"/>
                            Log out
                        </button>
                    </SheetGroup>
                </div>
            </Sheet>
        </div>
    );
}

const sheetRow = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-body font-medium text-fg transition-colors hover:bg-surface-hover";

function SheetGroup({children}: { children: ReactNode }) {
    return <div className="rounded-2xl bg-surface-sunken p-1">{children}</div>;
}

function SheetLink({to, state, icon: Icon, onClick, chevron, trailing, children}: {
    to: string;
    state?: unknown;
    icon: IconType;
    onClick: () => void;
    chevron?: boolean;
    trailing?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Link to={to} state={state} onClick={onClick} className={sheetRow}>
            <Icon size={20} className="shrink-0 text-muted"/>
            <span className="flex min-w-0 flex-1 items-center">{children}</span>
            {trailing}
            {chevron && <ChevronRightIcon size={18} className="text-subtle"/>}
        </Link>
    );
}

function SidebarGroup({label, children}: { label: string; children: ReactNode }) {
    return (
        <div className="mt-6">
            <p className="px-3 pb-2 text-overline text-subtle uppercase">{label}</p>
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}

function SidebarLink({to, state, icon: Icon, active, trailing, children}: {
    to: string;
    state?: unknown;
    icon: IconType;
    active: boolean;
    trailing?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Link
            to={to}
            state={state}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-body-sm font-medium transition-colors ${
                active ? "bg-primary-soft font-semibold text-on-primary-soft" : "text-muted hover:bg-surface-hover hover:text-fg"
            }`}
        >
            <Icon size={18} className="shrink-0"/>
            {children}
            {trailing}
        </Link>
    );
}

interface DestinationProps {
    label: string;
    icon: IconType;
    active: boolean;
    count?: number;
    to?: string;
    onClick?: () => void;
    /** For the More button: whether its sheet is open. */
    expanded?: boolean;
}

function Destination({to, onClick, active, expanded, className, children}: Omit<DestinationProps, "label" | "icon" | "count"> & {
    className: string;
    children: ReactNode;
}) {
    return to ? (
        <Link to={to} aria-current={active ? "page" : undefined} className={className}>{children}</Link>
    ) : (
        <button type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={expanded} className={className}>{children}</button>
    );
}

function TabItem({to, onClick, label, icon: Icon, active, expanded, count = 0}: DestinationProps) {
    return (
        <Destination to={to} onClick={onClick} active={active} expanded={expanded}
                     className="relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] leading-3.5 font-semibold">
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                active ? "bg-primary-soft text-on-primary-soft" : "text-subtle"
            }`}>
                <Icon size={22}/>
            </span>
            <span className={active ? "text-on-primary-soft" : "text-subtle"}>{label}{warnings(count)}</span>
            <CountBubble count={count} className="absolute top-1.5 left-1/2 ml-2.5"/>
        </Destination>
    );
}

function RailItem({to, onClick, label, icon: Icon, active, expanded, count = 0}: DestinationProps) {
    return (
        <Destination to={to} onClick={onClick} active={active} expanded={expanded}
                     className="relative flex w-16 flex-col items-center gap-1 rounded-2xl py-2 text-caption font-semibold">
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                active ? "bg-primary-soft text-on-primary-soft" : "text-subtle hover:bg-surface-hover"
            }`}>
                <Icon size={22}/>
            </span>
            <span className={active ? "text-on-primary-soft" : "text-subtle"}>{label}{warnings(count)}</span>
            <CountBubble count={count} className="absolute top-1 left-1/2 ml-2.5"/>
        </Destination>
    );
}
