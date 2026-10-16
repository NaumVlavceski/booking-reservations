import type {ReservationResponse} from "./api/reservations";

export type ReservationSource = ReservationResponse["source"];
export type ReservationStatus = ReservationResponse["status"];

export const SOURCE_LABEL: Record<ReservationSource, string> = {DIRECT: "Direct", BOOKING: "Booking.com", AIRBNB: "Airbnb"};

export const STATUS_LABEL: Record<ReservationStatus, string> = {
    CONFIRMED: "Confirmed",
    PAID: "Paid",
    BLOCK: "Blocked",
    CANCELLED: "Cancelled",
};
