import {queryOptions} from "@tanstack/react-query";
import {apiClient} from "./client.ts";

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
    cancelledAt: string | null;
    /** When the owner erased the guest's personal details (null if never). */
    guestErasedAt: string | null;
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
export async function restoreReservation(r: ReservationResponse, status: ReservationRequest["status"] = "CONFIRMED") {
    return updateReservation(r.id, {
        unitId: r.unitId,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status,
        pricePerGuest: r.pricePerGuest ?? null,
        nightlyRate: r.nightlyRate ?? null,
        totalAmount: r.totalAmount ?? null,
        guestName: r.guestName ?? "",
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
/** Removes the guest's name, email, phone and notes from a booking for good; dates, room and amounts stay. */
export async function eraseGuest(id: string): Promise<ReservationResponse> {
    const res = await apiClient.post<ReservationResponse>(`/api/reservations/${id}/erase-guest`);
    return res.data;
}
