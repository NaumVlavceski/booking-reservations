import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { tokenStorage } from "../lib/auth/tokenStorage";
// import {useQueryClient} from "@tanstack/react-query";

const navItems = [
    { to: "/dashboard", label: "Overview" },
    { to: "/dashboard/properties", label: "Properties" },
    { to: "/dashboard/calendar", label: "Calendar" },
];

export default function DashboardLayout() {
    const navigate = useNavigate();
    // const queryClient = useQueryClient();

    function handleLogout() {
        tokenStorage.clear();
        // queryClient.clear();
        navigate("/login", { replace: true });
    }

    return (
        <div className="min-h-screen flex">
            <aside className="w-56 bg-gray-900 text-white flex flex-col">
                <div className="px-4 py-5 text-lg font-semibold border-b border-gray-800">
                    Booking
                </div>

                <nav className="flex-1 px-2 py-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === "/dashboard"}
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

                <div className="px-2 py-4 border-t border-gray-800">
                    <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 rounded text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
                    >
                        Log out
                    </button>
                </div>
            </aside>

            <main className="flex-1 bg-gray-50 p-6">
                <Outlet />
            </main>
        </div>
    );
}