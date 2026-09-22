import {Routes, Route, Navigate} from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import DashboardLayout from "./components/DashboardLayout.tsx";
import PropertiesPage from "./pages/PropertiesPage.tsx";
import PropertyFormPage from "./pages/PropertyFormPage.tsx";
import PropertyDetailPage from "./pages/PropertyDetailPage.tsx";
import UnitFormPage from "./pages/UnitFormPage.tsx";


export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage/>}/>
            <Route path="/register" element={<RegisterPage/>}/>
            <Route element={<ProtectedRoute/>}>
                <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<div>Overview coming soon</div>} />
                    <Route path="/dashboard/properties" element={<PropertiesPage/>} />
                    <Route path="/dashboard/calendar" element={<div>Calendar coming soon</div>} />
                    <Route path="/dashboard/properties" element={<PropertiesPage />} />
                    <Route path="/dashboard/properties/new" element={<PropertyFormPage />} />
                    <Route path="/dashboard/properties/:id" element={<PropertyDetailPage />} />
                    <Route path="/dashboard/properties/:id/edit" element={<PropertyFormPage />} />
                    <Route path="/dashboard/properties/:propertyId/units/new" element={<UnitFormPage />} />
                    <Route path="/dashboard/properties/:propertyId/units/:unitId" element={<UnitFormPage />} />
                </Route>
            </Route>
            <Route path="*" element={<Navigate to="/login" replace/>}/>
        </Routes>
    );
}