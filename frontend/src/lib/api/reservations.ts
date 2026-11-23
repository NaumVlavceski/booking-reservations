import {queryOptions} from "@tanstack/react-query";
import {apiClient} from "./client.ts";
import {guestNameOf} from "../bookingLabel";

export interface ReservationResponse {
    id: string;
    unitId: string;
    checkIn: string;
    checkOut: string;
    status: "CONFIRMED" | "CANCELLED" | "PAID" | "BLOCK";
    source: "DIRECT" | "BOOKING" | "AIRBNB";
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
    guestsCount: number;
    pricePerGuest: number;
    nightlyRate: number;
    totalAmount: number;
    notes: string;
    priceNeedsReview: boolean;
    /**
     * Imported booking its channel's feed no longer lists. Live: the next sync cancels it if it's still gone.
     * Cancelled: it can only be restored as a Direct booking (asDirect), or the sync cancels it again.
     */
    missingFromFeed: boolean;
    /** Live channel booking its channel listed at the last sync: cancelled on the channel, not in RoomTrack. */
    listedByChannel: boolean;
    cancelledAt: string | null;
}

export interface ReservationRequest{
    unitId: string;
    checkIn: string;
    checkOut: string;
    status: "CONFIRMED" | "CANCELLED" | "PAID" | "BLOCK";
    pricePerGuest: number | null;
    nightlyRate: number | null;
    totalAmount: number | null;
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    guestsCount: number;
    notes: string;
    /** Changing only: makes a channel booking a Direct one that the sync no longer touches. */
    asDirect?: boolean;
}

export interface ReservationFilters {
    unitId?: string;
    status?: string;
}
export async function getReservations(filters?: ReservationFilters): Promise<ReservationResponse[]> {
    const res = await apiClient.get<ReservationResponse[]>("/api/reservations", {
        params: filters,
    });
    return res.data;
}
export interface PageResponse<T> {
    items: T[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
}

export interface CancelledParams {
    page: number;
    size: number;
    name?: string;
    checkInFrom?: string;
}

export async function getCancelledReservations(params: CancelledParams): Promise<PageResponse<ReservationResponse>> {
    const res = await apiClient.get<PageResponse<ReservationResponse>>("/api/reservations/cancelled", {
        params: {
            page: params.page,
            size: params.size,
            name: params.name || undefined,
            checkInFrom: params.checkInFrom || undefined,
        },
    });
    return res.data;
}

export const allReservationsQuery = queryOptions({
    queryKey: ["reservations", "calendar"],
    queryFn: () => getReservations(),
    // While a booking waits for the sync that confirms its cancellation (a couple of minutes), keep the calendar fresh
    refetchInterval: (query) => query.state.data?.some((r) => r.missingFromFeed) ? 60_000 : false,
});

export async function deleteReservation(id: string): Promise<void> {
    await apiClient.delete(`/api/reservations/${id}`);
}
export async function getReservation(id: string): Promise<ReservationResponse> {
    const res = await apiClient.get<ReservationResponse>(`/api/reservations/${id}`);
    return res.data;
}

export async function createReservation(data: ReservationRequest): Promise<ReservationResponse> {
    const res = await apiClient.post<ReservationResponse>("/api/reservations", data);
    return res.data;
}

/** Puts a cancelled booking back on the calendar. Fails with 409 if its dates were taken meanwhile. */
/** A channel booking its channel no longer lists only stays restored as a Direct one (see needsRestoreAsDirect). */
export function needsRestoreAsDirect(r: ReservationResponse): boolean {
    return r.status === "CANCELLED" && r.source !== "DIRECT" && r.missingFromFeed;
}

export async function restoreReservation(r: ReservationResponse, status: ReservationRequest["status"] = "CONFIRMED",
                                         asDirect = false) {
    return updateReservation(r.id, {
        asDirect,
        unitId: r.unitId,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status,
        pricePerGuest: r.pricePerGuest ?? null,
        nightlyRate: r.nightlyRate ?? null,
        totalAmount: r.totalAmount ?? null,
        // As Direct, a channel's placeholder ("CLOSED - Not available") would show as the guest's name
        guestName: asDirect ? guestNameOf(r) : r.guestName ?? "",
        guestEmail: r.guestEmail ?? "",
        guestPhone: r.guestPhone ?? "",
        guestsCount: r.guestsCount,
        notes: r.notes ?? "",
    });
}

export async function updateReservation(id: string, data: ReservationRequest): Promise<ReservationResponse | null> {
    const res = await apiClient.put<ReservationResponse>(`/api/reservations/${id}`, data);
    return res.status === 204 ? null : res.data;
}

export interface AvailableOption {
    unitId: string;
    name: string;
}

export async function getAvailableOptions(id: string): Promise<AvailableOption[]> {
    const res = await apiClient.get<AvailableOption[]>(`/api/reservations/${id}/available-options`);
    return res.data;
}

export async function moveReservation(id: string, unitId: string): Promise<ReservationResponse> {
    const res = await apiClient.post<ReservationResponse>(`/api/reservations/${id}/move`, {unitId});
    return res.data;
}
export async function copyReservation(id: string, unitIds: string[]): Promise<ReservationResponse[]> {
    const res = await apiClient.post<ReservationResponse[]>(`/api/reservations/${id}/copy`, {unitIds});
    return res.data;
}

