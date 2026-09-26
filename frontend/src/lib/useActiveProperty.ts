import {useEffect} from "react";
import {useMatch} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {propertiesQuery, type PropertyResponse} from "./api/properties";

const LAST_PROPERTY_KEY = "staytrack.lastPropertyId";

function readLastPropertyId(): string | null {
    try {
        return localStorage.getItem(LAST_PROPERTY_KEY);
    } catch {
        return null;
    }
}

/**
 * The property the user is "in": the one in the URL if they're on a
 * property page, otherwise the last one they viewed, otherwise their first.
 */
export function useActiveProperty(): PropertyResponse | undefined {
    const match = useMatch("/dashboard/properties/:propertyId/*");
    const routeId = match?.params.propertyId;
    const routePropertyId = routeId && routeId !== "new" ? routeId : undefined;

    const {data: properties} = useQuery(propertiesQuery);

    useEffect(() => {
        if (!routePropertyId) return;
        try {
            localStorage.setItem(LAST_PROPERTY_KEY, routePropertyId);
        } catch {
            // Storage unavailable (private mode etc.) — falling back to the first property is fine.
        }
    }, [routePropertyId]);

    if (!properties || properties.length === 0) return undefined;
    const lastId = readLastPropertyId();
    return (
        properties.find((p) => p.id === routePropertyId) ??
        properties.find((p) => p.id === lastId) ??
        properties[0]
    );
}

export function addUnitPath(property: PropertyResponse | undefined): string {
    return property ? `/dashboard/properties/${property.id}/units/new` : "/dashboard/properties/new";
}
