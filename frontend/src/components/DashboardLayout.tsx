// src/components/DashboardLayout.tsx
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
// import { useQueryClient } from "@tanstack/react-query";
import { tokenStorage } from "../lib/auth/tokenStorage";

const navItems = [
    { to: "/dashboard/calendar", label: "Calendar" },
    { to: "/dashboard/properties", label: "Properties" },
    { to: "/dashboard/reservations", label: "Reservations" },
];

export default function DashboardLayout() {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const navigate = useNavigate();
    // const queryClient = useQueryClient();

    function handleLogout() {
        tokenStorage.clear();
        // queryClient.clear();
        setIsDrawerOpen(false);
        navigate("/login", { replace: true });
    }

    function handleNavClick() {
        setIsDrawerOpen(false);
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Hamburger button — fixed, always accessible */}
            <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                aria-label="Open menu"
                className="fixed top-4 left-4 z-30 bg-white border rounded-lg p-2 shadow-sm hover:bg-gray-50"
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            {/* Overlay backdrop — click to dismiss */}
            {isDrawerOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-40 transition-opacity"
                    onClick={() => setIsDrawerOpen(false)}
                />
            )}

            {/* Slide-out drawer */}
            <div
                className={`fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-50 transform transition-transform duration-200 ease-out ${
                    isDrawerOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex justify-between items-center px-4 py-5 border-b border-gray-800">
                    <span className="text-lg font-semibold">Booking</span>
                    <button
                        type="button"
                        onClick={() => setIsDrawerOpen(false)}
                        aria-label="Close menu"
                        className="text-gray-400 hover:text-white text-xl leading-none"
                    >
                        ×
                    </button>
                </div>

                <nav className="flex-1 px-2 py-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={handleNavClick}
                            className={({ isActive }) =>
                                `block px-3 py-2 rounded text-sm font-medium ${
                                    isActive
                                        ? "bg-gray-800 text-white"
                                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                                }`
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 px-2 py-4 border-t border-gray-800">
                    <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 rounded text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
                    >
                        Log out
                    </button>
                </div>
            </div>

            {/* Main content — full width now, no reserved sidebar space */}
            <main className="p-6 pt-20">
                <Outlet />
            </main>
        </div>
    );
}