import {apiClient} from "./client.ts";

export interface ReservationResponse {
    id: string;
    unitId: string;
    checkIn: string;
    checkOut: string;
    status: "CONFIRMED" | "CANCELLED";
    source: "DIRECT" | "BOOKING" | "AIRBNB" | "MANUAL_BLOCK";
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
    guestsCount: number;
    pricePerGuest: number;
    nightlyRate: number;
    totalAmount: number;
    notes: string;
}

export interface ReservationRequest{
    unitId: string;
    checkIn: string;
    checkOut: string;
    pricePerGuest: number;
    nightlyRate: number;
    totalAmount: number;
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

export async function updateReservation(id: string, data: ReservationRequest): Promise<ReservationResponse> {
    const res = await apiClient.put<ReservationResponse>(`/api/reservations/${id}`, data);
    return res.data;
}
