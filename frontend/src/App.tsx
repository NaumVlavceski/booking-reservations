import {Routes, Route, Navigate} from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import DashboardLayout from "./components/DashboardLayout.tsx";

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage/>}/>
            <Route path="/register" element={<RegisterPage/>}/>
            <Route element={<ProtectedRoute/>}>
                <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<div>Overview coming soon</div>} />
                    <Route path="/dashboard/properties" element={<div>Properties coming soon</div>} />
                    <Route path="/dashboard/calendar" element={<div>Calendar coming soon</div>} />
                </Route>
            </Route>
            <Route path="*" element={<Navigate to="/login" replace/>}/>
        </Routes>
    );
}