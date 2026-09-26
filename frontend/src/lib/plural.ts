import type {ReservationResponse} from "./api/reservations";
import type {UnitResponse} from "./api/units";

/** "1 unit", "3 units". */
export function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Deleting a property cascades to its units and their reservations — say how many. */
export function propertyDeleteMessage(
    propertyId: string | undefined,
    units: UnitResponse[] | undefined,
    reservations: ReservationResponse[] | undefined,
): string {
    const unitIds = new Set((units ?? []).filter((u) => u.propertyId === propertyId).map((u) => u.id));
    const reservationCount = (reservations ?? []).filter((r) => unitIds.has(r.unitId)).length;
    const parts = [];
    if (unitIds.size > 0) parts.push(plural(unitIds.size, "unit"));
    if (reservationCount > 0) parts.push(plural(reservationCount, "reservation"));
    return parts.length > 0
        ? `This also deletes its ${parts.join(" and ")}. This can't be undone.`
        : "This can't be undone.";
}

/** Deleting a unit cascades to its reservations — say how many will go with it. */
export function unitDeleteMessage(reservations: ReservationResponse[] | undefined, unitId: string | undefined): string {
    const count = (reservations ?? []).filter((r) => r.unitId === unitId).length;
    return count > 0
        ? `This also deletes its ${plural(count, "reservation")}. This can't be undone.`
        : "It will be removed from the property and the calendar. This can't be undone.";
}
