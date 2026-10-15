import {addDays, differenceInCalendarDays, eachDayOfInterval, format} from "date-fns";
import {parseLocalDate} from "./dates";

export interface BookedRange {
    checkIn: string;
    checkOut: string;
}

export type PickStep = "checkIn" | "checkOut";

const toIso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Every night already taken by another stay on this unit. Each range is half-open [checkIn, checkOut):
 * the check-out day is a free check-in day for the next booking, so it is not included.
 */
export function blockedNights(ranges: BookedRange[]): Set<string> {
    const nights = new Set<string>();
    for (const range of ranges) {
        const from = parseLocalDate(range.checkIn);
        const to = parseLocalDate(range.checkOut);
        if (differenceInCalendarDays(to, from) <= 0) continue;
        for (const night of eachDayOfInterval({start: from, end: addDays(to, -1)})) nights.add(toIso(night));
    }
    return nights;
}

/**
 * A check-out day is allowed if it is after the check-in and none of the nights in between are taken.
 * The day itself may be taken: leaving on the morning another guest arrives is fine.
 */
export function canCheckOutOn(day: Date, checkIn: Date | undefined, blocked: Set<string>): boolean {
    if (!checkIn) return true;
    if (differenceInCalendarDays(day, checkIn) <= 0) return false;
    return !eachDayOfInterval({start: checkIn, end: addDays(day, -1)}).some((night) => blocked.has(toIso(night)));
}

/**
 * Whether the calendar paints this day as "already booked". On the check-out step a day you are allowed to
 * pick is never painted that way, even if another stay starts on it, or it would look taken yet be clickable.
 */
export function showAsBooked(day: Date, step: PickStep, checkIn: Date | undefined, blocked: Set<string>): boolean {
    if (!blocked.has(toIso(day))) return false;
    return !(step === "checkOut" && canCheckOutOn(day, checkIn, blocked));
}
