// src/components/DashboardLayout.tsx
import {useEffect, useState} from "react";
import {NavLink, Outlet, useLocation, useNavigate} from "react-router-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {tokenStorage} from "../lib/auth/tokenStorage";
import {getMe} from "../lib/api/me";
import {addUnitPath, useActiveProperty} from "../lib/useActiveProperty";
import {useFromHere} from "../lib/useReturnTo";
import {CalendarIcon, CloseIcon, HouseIcon, LogoutIcon, MenuIcon, PlusIcon} from "./icons";

const navItems = [
    {to: "/dashboard/calendar", label: "Calendar", icon: CalendarIcon},
    {to: "/dashboard/properties", label: "Properties", icon: HouseIcon},
];

const drawerLinkBase = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors";
const drawerLinkIdle = "text-slate-300 hover:bg-white/5 hover:text-white";

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null);
    const isDrawerOpen = drawerOpenedAt === location.key;
    const setIsDrawerOpen = (open: boolean) => setDrawerOpenedAt(open ? location.key : null);
    const queryClient = useQueryClient();
    const activeProperty = useActiveProperty();
    const {data: me} = useQuery({queryKey: ["me"], queryFn: getMe, staleTime: Infinity});
    const fromHere = useFromHere();
    const isCalendar = location.pathname.startsWith("/dashboard/calendar");
    useEffect(() => {
        if (!isDrawerOpen) return;

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

    return (
        <div className="min-h-screen">
            {/* Desktop: floating menu button. Phones use the bottom tab bar instead. */}
            <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                aria-label="Open menu"
                className="fixed top-4 left-4 z-30 hidden h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:flex"
            >
                <MenuIcon size={20}/>
            </button>

            <div
                className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 ${
                    isDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={closeDrawer}
            />

            <aside
                inert={!isDrawerOpen}
                className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-slate-900 text-white shadow-2xl transition-transform duration-200 ease-out ${
                    isDrawerOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 pt-[calc(env(safe-area-inset-top)_+_1.25rem)] pb-5">
                    <div className="min-w-0">
                        <p className="truncate text-lg font-bold">{me?.businessName ?? "Staytrack"}</p>
                        {/*<p className="truncate text-sm text-slate-400">*/}
                        {/*    {activeProperty*/}
                        {/*        ? `${activeProperty.name} · ${activeProperty.address}`*/}
                        {/*        : "Manage every booking in one place"}*/}
                        {/*</p>*/}
                    </div>
                    <button
                        type="button"
                        onClick={closeDrawer}
                        aria-label="Close menu"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <CloseIcon size={18}/>
                    </button>
                </div>

                <nav className="space-y-1 border-b border-white/10 px-3 py-4">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={closeDrawer}
                            className={({isActive}) =>
                                `${drawerLinkBase} ${isActive ? "bg-white/10 font-semibold text-white" : drawerLinkIdle}`
                            }
                        >
                            <item.icon/>
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="px-3 py-4">
                    <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-slate-500">QUICK ADD</p>
                    <NavLink to="/dashboard/properties/new" end onClick={closeDrawer}
                             className={`${drawerLinkBase} ${drawerLinkIdle}`}>
                        <PlusIcon size={16}/>
                        Add property
                    </NavLink>
                    <NavLink to={addUnitPath(activeProperty)} state={fromHere} onClick={closeDrawer}
                             className={`${drawerLinkBase} ${drawerLinkIdle}`}>
                        <PlusIcon size={16}/>
                        <span className="min-w-0">
                            Add unit
                            {activeProperty && (
                                <span className="block truncate text-xs font-normal text-slate-500">
                                    to {activeProperty.name}
                                </span>
                            )}
                        </span>
                    </NavLink>
                </div>

                <div className="mt-auto border-t border-white/10 px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">
                    <button onClick={handleLogout} className={`w-full ${drawerLinkBase} ${drawerLinkIdle}`}>
                        <LogoutIcon size={16}/>
                        Log out
                    </button>
                </div>
            </aside>

            <main
                className={
                    isCalendar
                        ? "pb-[calc(4rem_+_env(safe-area-inset-bottom))] sm:px-6 sm:pt-20 sm:pb-8"
                        : "mx-auto max-w-3xl px-4 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 sm:pt-20 sm:pb-12"
            }
            >
                <Outlet/>
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
                    className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                        isDrawerOpen ? "text-teal-700" : "text-slate-500"
                    }`}
                >
                    <MenuIcon size={22}/>
                    Menu
                </button>
            </nav>
        </div>
    );
}
