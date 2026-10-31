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
import CancelledReservationsPage from "./pages/CancelledReservationsPage.tsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.tsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.tsx";
import ChangePasswordPage from "./pages/ChangePasswordPage.tsx";
import ConnectCalendarsHelpPage from "./pages/ConnectCalendarsHelpPage.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";
import InvoicesPage from "./pages/InvoicesPage.tsx";
import InvoicePropertyPage from "./pages/InvoicePropertyPage.tsx";
import InvoiceUnitPage from "./pages/InvoiceUnitPage.tsx";
import InvoiceMissingAmountsPage from "./pages/InvoiceMissingAmountsPage.tsx";
import OnboardingPage from "./pages/OnboardingPage.tsx";
import OnboardingGate from "./components/OnboardingGate.tsx";
import CalendarGate from "./components/CalendarGate.tsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.tsx";
import TermsPage from "./pages/TermsPage.tsx";
import AccountPage from "./pages/AccountPage.tsx";


export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage/>}/>
            <Route path="/register" element={<RegisterPage/>}/>
            <Route path="/verify-email" element={<VerifyEmailPage/>}/>
            <Route path="/forgot-password" element={<ForgotPasswordPage/>}/>
            {/* Public: readable before signing up and from inside the app */}
            <Route path="/privacy" element={<PrivacyPolicyPage/>}/>
            <Route path="/terms" element={<TermsPage/>}/>
            <Route path="/" element={<Navigate to="/dashboard/calendar" replace/>}/>
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
                    <Route path="/dashboard/calendar" element={<OnboardingGate><CalendarGate><CalendarPage /></CalendarGate></OnboardingGate>} />
                    <Route path="/dashboard/welcome" element={<OnboardingPage/>}/>
                    <Route path="/dashboard/conflicts" element={<ConflictsPage />} />
                    <Route path="/dashboard/sync-health" element={<SyncHealthPage/>}/>
                    <Route path="/dashboard/cancelled" element={<CancelledReservationsPage/>}/>
                    <Route path="/dashboard/invoices" element={<InvoicesPage/>}/>
                    <Route path="/dashboard/invoices/properties/:propertyId" element={<InvoicePropertyPage/>}/>
                    <Route path="/dashboard/invoices/units/:unitId" element={<InvoiceUnitPage/>}/>
                    <Route path="/dashboard/invoices/properties/:propertyId/missing-amounts" element={<InvoiceMissingAmountsPage/>}/>
                    <Route path="/dashboard/help/connect-calendars" element={<ConnectCalendarsHelpPage/>}/>
                    <Route path="/dashboard/account" element={<AccountPage/>}/>
                    <Route path="/dashboard/account/password" element={<ChangePasswordPage/>}/>
                    <Route path="*" element={<NotFoundPage/>}/>
                </Route>
            </Route>
        </Routes>
    );
}