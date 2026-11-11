import {useQuery} from "@tanstack/react-query";
import {propertiesQuery} from "./api/properties";

/** First run: a new owner adds their property (name, address, number of rooms) here, then lands on the calendar. */
export const ONBOARDING_PATH = "/dashboard/setup";

/** True once we know this owner has no property yet: the calendar sends them to the setup form first. */
export function useNeedsOnboarding(): boolean {
    const {data: properties} = useQuery(propertiesQuery);
    return properties !== undefined && properties.length === 0;
}
