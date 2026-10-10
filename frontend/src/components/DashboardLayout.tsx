// src/components/DashboardLayout.tsx
import {useEffect, useRef, useState} from "react";
import {NavLink, Outlet, useLocation, useNavigate} from "react-router-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {getMe} from "../lib/api/me";
import {addUnitPath, useActiveProperty} from "../lib/useActiveProperty";
import {useFromHere} from "../lib/useReturnTo";
import {useMediaQuery} from "../lib/useMediaQuery";
import {useSyncAlerts} from "../lib/useSyncAlerts";
import {
    AlertIcon,
    CalendarIcon,
    CalendarXIcon,
    CloseIcon,
    HouseIcon,
    LogoutIcon,
    MenuIcon,
    PlusIcon,
    SyncIcon
} from "./icons";
import SyncAlerts from "./SyncAlerts.tsx";

const navItems = [
    {to: "/dashboard/calendar", label: "Calendar", icon: CalendarIcon},
    {to: "/dashboard/properties", label: "Properties", icon: HouseIcon},
];

const navLinkBase = "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400";
const navLinkIdle = "text-slate-300 hover:bg-white/5 hover:text-white";
const navLinkClass = ({isActive}: { isActive: boolean }) =>
    `${navLinkBase} ${isActive ? "bg-white/10 font-semibold text-white" : navLinkIdle}`;

function CountBadge({count, tone}: { count: number; tone: "red" | "amber" }) {
    if (count === 0) return null;
    return (
        <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold ${
            tone === "red" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-950"
        }`}>
            {count}
        </span>
    );
}

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    // Phones/tablets get a slide-in drawer; wide screens a permanent sidebar.
    const isWide = useMediaQuery("(min-width: 1024px)");
    const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null);
    const isDrawerOpen = !isWide && drawerOpenedAt === location.key;
    const setIsDrawerOpen = (open: boolean) => setDrawerOpenedAt(open ? location.key : null);
    const queryClient = useQueryClient();
    const activeProperty = useActiveProperty();
    const {data: me} = useQuery({queryKey: ["me"], queryFn: getMe, staleTime: Infinity});
    const {conflictCount, failingCount, total: alertCount} = useSyncAlerts();
    const fromHere = useFromHere();
    const isCalendar = location.pathname.startsWith("/dashboard/calendar");
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isDrawerOpen) return;
        // Move focus into the drawer so keyboard and screen-reader users land in it.
        closeButtonRef.current?.focus();

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setDrawerOpenedAt(null);
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isDrawerOpen]);

    function closeDrawer() {
        setIsDrawerOpen(false);
    }

    function handleLogout() {
        tokenStorage.clear();
        queryClient.clear();
        setIsDrawerOpen(false);
        navigate("/login", {replace: true});
    }

    const panelVisible = isWide || isDrawerOpen;

    return (
        <div className="min-h-screen">
            {/* Tablets: floating menu button. Phones use the bottom tab bar; wide screens the sidebar. */}
            <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                aria-label="Open menu"
                className="fixed top-4 left-4 z-30 hidden h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:flex lg:hidden"
            >
                <MenuIcon size={20}/>
                {alertCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-red-500"/>
                )}
            </button>

            <div
                className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 lg:hidden ${
                    isDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={closeDrawer}
            />

            <aside
                inert={!panelVisible}
                aria-label="Main menu"
                className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-slate-900 text-white shadow-2xl transition-transform duration-200 ease-out lg:z-30 lg:w-64 lg:shadow-none ${
                    panelVisible ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 pt-[calc(env(safe-area-inset-top)_+_1.25rem)] pb-5">
                    <p className="min-w-0 truncate text-lg font-bold">{me?.businessName ?? "Staytrack"}</p>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={closeDrawer}
                        aria-label="Close menu"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
                    >
                        <CloseIcon size={18}/>
                    </button>
                </div>

                <nav className="space-y-1 border-b border-white/10 px-3 py-4">
                    {navItems.map((item) => (
                        <NavLink key={item.to} to={item.to} onClick={closeDrawer} className={navLinkClass}>
                            <item.icon/>
                            {item.label}
                        </NavLink>
                    ))}
                    <NavLink to="/dashboard/cancelled" onClick={closeDrawer} className={navLinkClass}>
                        <CalendarXIcon/>
                        Cancelled bookings
                    </NavLink>
                </nav>

                <div className="px-3 py-4">
                    <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Channels</p>
                    <NavLink to="/dashboard/conflicts" end onClick={closeDrawer} className={navLinkClass}>
                        <AlertIcon size={16}/>
                        Booking conflicts
                        <CountBadge count={conflictCount} tone="red"/>
                    </NavLink>
                    <NavLink to="/dashboard/sync-health" onClick={closeDrawer} className={navLinkClass}>
                        <SyncIcon size={16}/>
                        Sync status
                        <CountBadge count={failingCount} tone="amber"/>
                    </NavLink>
                </div>

                <div className="px-3 py-4">
                    <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Quick add</p>
                    <NavLink to="/dashboard/properties/new" end onClick={closeDrawer}
                             className={`${navLinkBase} ${navLinkIdle}`}>
                        <PlusIcon size={16}/>
                        Add property
                    </NavLink>
                    <NavLink to={addUnitPath(activeProperty)} state={fromHere} onClick={closeDrawer}
                             className={`${navLinkBase} ${navLinkIdle}`}>
                        <PlusIcon size={16}/>
                        <span className="min-w-0">
                            Add room
                            {activeProperty && (
                                <span className="block truncate text-xs font-normal text-slate-400">
                                    to {activeProperty.name}
                                </span>
                            )}
                        </span>
                    </NavLink>
                </div>

                <div className="mt-auto border-t border-white/10 px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">
                    <button onClick={handleLogout} className={`w-full ${navLinkBase} ${navLinkIdle}`}>
                        <LogoutIcon size={16}/>
                        Log out
                    </button>
                </div>
            </aside>

            <main
                className={
                    isCalendar
                        ? "pb-[calc(4rem_+_env(safe-area-inset-bottom))] sm:px-6 sm:pt-20 sm:pb-8 lg:pt-8 lg:pl-70"
                        : "mx-auto max-w-3xl px-4 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 sm:pt-20 sm:pb-12 lg:max-w-none lg:pt-8 lg:pl-70"
                }
            >
                <div className={isCalendar ? "" : "lg:mx-auto lg:max-w-3xl"}>
                    <SyncAlerts/>
                    <Outlet/>
                </div>
            </main>

            {/* Phones: bottom tab bar. */}
            <nav
                className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({isActive}) =>
                            `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                                isActive ? "text-teal-700" : "text-slate-500"
                            }`
                        }
                    >
                        <item.icon size={22}/>
                        {item.label}
                    </NavLink>
                ))}
                <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    aria-label={alertCount > 0 ? `Menu, ${alertCount} ${alertCount === 1 ? "warning" : "warnings"}` : "Menu"}
                    className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                        isDrawerOpen ? "text-teal-700" : "text-slate-500"
                    }`}
                >
                    <span className="relative">
                        <MenuIcon size={22}/>
                        {alertCount > 0 && (
                            <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 font-bold text-white">
                                {alertCount}
                            </span>
                        )}
                    </span>
                    Menu
                </button>
            </nav>
        </div>
    );
}
