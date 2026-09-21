import {tokenStorage} from "../lib/auth/tokenStorage.ts";
import {Navigate, Outlet} from "react-router-dom";

export default function ProtectedRoute() {
    const token = tokenStorage.get();

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}