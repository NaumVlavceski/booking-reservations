import {describe, expect, it} from "vitest";
import {plural, propertyDeleteMessage, unitDeleteMessage} from "./plural";
import type {ReservationResponse} from "./api/reservations";
import type {UnitResponse} from "./api/units";

const unit = (id: string, propertyId: string) => ({id, propertyId, name: id, capacity: 2}) as unknown as UnitResponse;
const res = (id: string, unitId: string) => ({id, unitId}) as unknown as ReservationResponse;

describe("plural", () => {
    it.each([
        [0, "0 rooms"], [1, "1 room"], [2, "2 rooms"], [11, "11 rooms"], [-1, "-1 rooms"],
    ])("%d → %s", (n, text) => {
        expect(plural(n, "room")).toBe(text);
    });
});

describe("propertyDeleteMessage", () => {
    const units = [unit("u1", "p1"), unit("u2", "p1"), unit("u3", "p2")];
    const reservations = [res("r1", "u1"), res("r2", "u2"), res("r3", "u3")];

    it("counts only this property's rooms and their reservations", () => {
        expect(propertyDeleteMessage("p1", units, reservations)).toBe("This also deletes its 2 rooms and 2 reservations. This can't be undone.");
        expect(propertyDeleteMessage("p2", units, reservations)).toBe("This also deletes its 1 room and 1 reservation. This can't be undone.");
    });
    it("rooms but no reservations", () => {
        expect(propertyDeleteMessage("p1", units, [])).toBe("This also deletes its 2 rooms. This can't be undone.");
    });
    it("nothing loaded yet", () => {
        expect(propertyDeleteMessage("p1", undefined, undefined)).toBe("This can't be undone.");
        expect(propertyDeleteMessage(undefined, units, reservations)).toBe("This can't be undone.");
    });
    it("cancelled bookings are not in the calendar list, so they are not counted (but are deleted too)", () => {
        // The calendar list (GET /api/reservations) leaves out CANCELLED; the cascade deletes them as well.
        expect(propertyDeleteMessage("p2", units, [res("r3", "u3")])).toContain("1 reservation");
    });
});

describe("unitDeleteMessage", () => {
    it("with reservations", () => {
        expect(unitDeleteMessage([res("r1", "u1"), res("r2", "u1"), res("r3", "u2")], "u1"))
            .toBe("This also deletes its 2 reservations. This can't be undone.");
    });
    it("without", () => {
        expect(unitDeleteMessage([], "u1")).toBe("It will be removed from the property and the calendar. This can't be undone.");
        expect(unitDeleteMessage(undefined, undefined)).toBe("It will be removed from the property and the calendar. This can't be undone.");
    });
});
