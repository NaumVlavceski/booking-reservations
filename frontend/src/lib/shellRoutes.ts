import {matchPath} from "react-router-dom";

// Forms take over the phone screen: no tab bar, a sticky Save bar at the bottom instead.
const FORM_ROUTES = [
    "/dashboard/properties/new",
    "/dashboard/properties/:id/edit",
    "/dashboard/properties/:propertyId/units/new",
    "/dashboard/properties/:propertyId/units/:unitId",
    "/dashboard/reservations/new",
    "/dashboard/reservations/:id",
    "/dashboard/account/password",
    // The first-run setup (property, address, rooms) after registering.
    "/dashboard/setup",
];

export function isFormRoute(pathname: string): boolean {
    return FORM_ROUTES.some((pattern) => matchPath(pattern, pathname) !== null);
}

export function isReservationForm(pathname: string): boolean {
    return ["/dashboard/reservations/new", "/dashboard/reservations/:id"]
        .some((pattern) => matchPath(pattern, pathname) !== null);
}

// The public home page and contact form have no tab bar either
const AUTH_ROUTES = ["/", "/login", "/register", "/verify-email", "/forgot-password", "/contact"];

/** What sits at the bottom of a phone screen: the tab bar, a form's Save bar, or nothing (auth pages). */
export function bottomChrome(pathname: string): "tabs" | "form" | "none" {
    if (AUTH_ROUTES.includes(pathname)) return "none";
    return isFormRoute(pathname) ? "form" : "tabs";
}
