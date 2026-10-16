import {format} from "date-fns";
import type {Modifiers} from "react-day-picker";

/**
 * Accessible name of a day in react-day-picker: starts with the number shown on the button (so voice control
 * "tap 21" works and the name matches the label), then the full date and its state.
 */
export function dayButtonLabel(date: Date, modifiers: Modifiers): string {
    const parts = [`${format(date, "d")} ${format(date, "MMMM yyyy, EEEE")}`];
    if (modifiers.today) parts.push("today");
    if (modifiers.selected) parts.push("selected");
    if (modifiers.booked) parts.push("already booked");
    return parts.join(", ");
}
