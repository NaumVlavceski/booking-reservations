import {Routes, Route, Navigate} from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import DashboardLayout from "./components/DashboardLayout.tsx";
import PropertiesPage from "./pages/PropertiesPage.tsx";
import PropertyFormPage from "./pages/PropertyFormPage.tsx";
import PropertyDetailPage from "./pages/PropertyDetailPage.tsx";
import UnitFormPage from "./pages/UnitFormPage.tsx";
import ReservationFormPage from "./pages/ReservationFormPage.tsx";
import CalendarPage from "./pages/CalendarPage.tsx";
import ConflictsPage from "./pages/ConflictsPage.tsx";
import SyncHealthPage from "./pages/SyncHealthPage.tsx";


export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage/>}/>
            <Route path="/register" element={<RegisterPage/>}/>
            <Route element={<ProtectedRoute/>}>
                <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<Navigate to="/dashboard/calendar" replace/>} />
                    <Route path="/dashboard/properties" element={<PropertiesPage />} />
                    <Route path="/dashboard/properties/new" element={<PropertyFormPage />} />
                    <Route path="/dashboard/properties/:id" element={<PropertyDetailPage />} />
                    <Route path="/dashboard/properties/:id/edit" element={<PropertyFormPage />} />
                    <Route path="/dashboard/properties/:propertyId/units/new" element={<UnitFormPage />} />
                    <Route path="/dashboard/properties/:propertyId/units/:unitId" element={<UnitFormPage />} />
                    <Route path="/dashboard/reservations/new" element={<ReservationFormPage/>}/>
                    <Route path="/dashboard/reservations/:id" element={<ReservationFormPage/>}/>
                    <Route path="/dashboard/calendar" element={<CalendarPage />} />
                    <Route path="/dashboard/conflicts" element={<ConflictsPage />} />
                    <Route path="/dashboard/sync-health" element={<SyncHealthPage/>}/>
                </Route>
            </Route>
            {/* Everything else lands on the calendar; ProtectedRoute bounces to /login if signed out. */}
            <Route path="*" element={<Navigate to="/dashboard/calendar" replace/>}/>
        </Routes>
    );
}